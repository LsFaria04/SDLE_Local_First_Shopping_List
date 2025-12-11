import WebSocket from "ws";
import ShoppingList from "../models/ShoppingList.js";
import express from "express";
import cors from "cors";
import pkg from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { Worker } from "worker_threads";
import { loadLists } from "../server/database_operations.js";

const { Database } = pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbNum = process.argv[2] ? "2" : "";
const dbPath = path.join(__dirname, `../database/local_db${dbNum}.db`);
const PROXY_PORTS = [5555, 5556, 5557]; 

const app = express();
app.use(cors({ origin: function (origin, callback) {

    if (['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://127.0.0.1:5174'].includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },}));
app.use(express.json());

let localLists = new Map(); // Local shopping lists
let isOnline = false; // Online status
const port = process.argv[2] || 3000;

// Database connection
const db = new Database(dbPath, (err) => {
  if (err) console.error("Database connection error:", err);
  else console.log("Connected to local database");
});

// Initialize database worker for async operations
const db_worker = new Worker(path.join(__dirname, "client_db_worker.js"), {
  workerData: { dbPath }
});

// Initialize database tables
function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS list(
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          globalId TEXT UNIQUE,
          soft_delete BOOLEAN NOT NULL DEFAULT 0
        )
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS product(
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          quantity INT NOT NULL DEFAULT 1,
          bought INT NOT NULL DEFAULT 0,
          soft_delete BOOLEAN NOT NULL DEFAULT 0,
          list_id INTEGER NOT NULL REFERENCES list(id),
          UNIQUE(name, list_id)
        )
      `, (err) => {
        if (err) reject(err);
        else {
          console.log("Database tables initialized");
          resolve();
        }
      });
    });
  });
}

// Load lists from database using server's loadLists function
async function loadListsFromDatabase() {
  try {
    const listsData = await loadLists(db);
    localLists.clear();
    
    for (const { list, products } of listsData) {
      // Use globalId if it exists and is a UUID, otherwise use database id
      const listId = list.globalId || list.id.toString();
      
      // Create ShoppingList and restore items
      const shoppingList = new ShoppingList(1, listId, list.name, false);
      
      for (const product of products) {
        // Restore item directly from database values without incrementing
        shoppingList.restoreItem(product.name, product.quantity, product.bought);
      }
      
      localLists.set(listId, shoppingList);
    }
    
    console.log(`Loaded ${localLists.size} lists from database`);
  } catch (err) {
    console.error("Error loading lists:", err);
  }
}

// Get all lists
app.get("/lists", (req, res) => {
  const listsArray = Array.from(localLists.values())
    .filter((list) => list.deleted === false) 
    .map((list) => list.toJson());

  res.json({ lists: listsArray });

});

// Get a specific list by ID
app.get("/lists/:listID", async (req, res) => {
  const listID = req.params.listID;
  const list = localLists.get(listID);

  let responded = false;
  const safeRespond = (status, body) => {
    if (responded) return;
    responded = true;
    if (status) res.status(status).json(body);
    else res.json(body);
  };

  //list already exists
  if (list) {
    return safeRespond(null, { list: list.toJson() });
  }

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(listID)) {
    return safeRespond(404, {
      error: "List not found locally and ID is not a valid UUID",
    });
  }

  console.log(`List ${listID} not found locally — fetching from server...`);

  const tryProxy = (index) => {
    if (index >= PROXY_PORTS.length) {
      return safeRespond(500, {
        error: "All proxies unavailable",
        online: false,
      });
    }

    const port = PROXY_PORTS[index];
    console.log(`Trying proxy on port ${port}...`);

    let socket;
    try {
      socket = new WebSocket(`ws://127.0.0.1:${port}`);
    } catch (err) {
      console.error(`Failed to create WebSocket for proxy ${port}:`, err);
      return tryProxy(index + 1);
    }

    socket.on("open", () => {
      console.log(`Connected to proxy ${port} — fetching list ${listID}`);
      socket.send(JSON.stringify({ type: "get", listId: listID }));
    });

    socket.on("message", (data) => {
      try {
        const reply = JSON.parse(data.toString());

        if (reply.code === 200 && reply.list) {
          const shoppingList = ShoppingList.fromJson(reply.list);

          // Store locally
          localLists.set(reply.list.listId, shoppingList);
          db_worker.postMessage({
            type: "create",
            list: shoppingList.toJson(),
          });

          socket.close();
          return safeRespond(null, { list: shoppingList.toJson() });
        }

        // Not found on server
        socket.close();
        return safeRespond(404, { error: "List not found on server" });

      } catch (err) {
        console.error("Error parsing server reply:", err);
        socket.close();
        return safeRespond(500, { error: "Failed to parse server response" });
      }
    });

    socket.on("error", (err) => {
      console.error(`Proxy ${port} error:`, err.message);
      socket.close();
      if (!responded) tryProxy(index + 1);
    });

    setTimeout(() => {
      if (socket.readyState === WebSocket.OPEN) {
        console.log(`Proxy ${port} timed out`);
        socket.close();
        if (!responded) tryProxy(index + 1);
      }
    }, 5000);
  };

  tryProxy(0);
});

// Create a new list
app.post("/lists", async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: "Missing name field" });
  }
  
  try {
    // insert into db
    const result = await new Promise((resolve, reject) => {
      db.run(
        "INSERT INTO list (name) VALUES (?)",
        [name],
        function (err) {
          if (err) return reject(err);
          resolve({ listId: this.lastID });
        }
      );
    });
    
    const dbId = result.listId.toString();
    
    // Create the actual list with the database ID
    const newList = new ShoppingList(1, dbId, name, false);
    localLists.set(dbId, newList);
    
    res.status(201).json({ list: newList.toJson() });
  } catch (err) {
    console.error("Error creating list:", err);
    res.status(500).json({ error: "Failed to create list" });
  }
});

// Delete a list
app.delete("/lists/:listId", (req, res) => {
  const listId = req.params.listId;
  if (localLists.has(listId)) {
    const list = localLists.get(listId);
    list.deleted = true;
    localLists.set(listId, list);

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    //test if is a local only list
    //Local only lists can be imediatly deleted permanently
    if (!uuidRegex.test(listId)) {
      // Permanent delete in database via worker
      console.log(`Deleting permanently list ${listId} from database`);
      db_worker.postMessage({ type: "delete_permanent", listId });
    }
    else{
      // Soft delete in database via worker
      console.log(`Deleting list ${listId} from database`);
      db_worker.postMessage({ type: "delete", listId });
    }
    
    
    
    res.json({ message: "List deleted" });
  } else {
    res.status(404).json({ error: "List not found" });
  }
});

// Add item to a list
app.post("/lists/:listId/items", (req, res) => {
  const listId = req.params.listId;
  const { itemName, quantity } = req.body;
  const list = localLists.get(listId);
  if (!list) {
    return res.status(404).json({ error: "List not found" });
  }
  list.addItem(itemName, quantity);
  
  // Update database via worker
  db_worker.postMessage({ type: "update", list: list.toJson() });
  
  res.json({ list: list.toJson() });
});

// Remove item from a list
app.delete("/lists/:listId/items/:itemName", (req, res) => {
  const listId = req.params.listId;
  const itemName = req.params.itemName;
  const list = localLists.get(listId);
  if (!list) {
    return res.status(404).json({ error: "List not found" });
  }
  list.removeItem(itemName);
  
  // Update database via worker
  db_worker.postMessage({ type: "update", list: list.toJson() });
  
  res.json({ list: list.toJson() });
});

// Mark item as bought
app.post("/lists/:listId/bought", (req, res) => {
  const listId = req.params.listId;
  const { itemName, quantity } = req.body;
  const list = localLists.get(listId);
  if (!list) {
    return res.status(404).json({ error: "List not found" });
  }
  list.markBought(itemName, quantity);
  
  // Update database via worker
  db_worker.postMessage({ type: "update", list: list.toJson() });
  
  res.json({ list: list.toJson() });
});

// Get online status
app.get("/status", (req, res) => {
  res.json({ online: isOnline });
});

// Toggle online/offline status
app.post("/toggle-online", (req, res) => {
  isOnline = !isOnline;
  res.json({ online: isOnline });
});

// Sync with server
app.post("/sync", async (req, res) => {
  
  let responded = false;

  const safeRespond = (status, body) => {
    if (responded) return;
    responded = true;
    if (status) res.status(status).json(body);
    else res.json(body);
  };

  if (localLists.size === 0) {
    return safeRespond(null, {
      online: isOnline,
      syncResults: [],
      message: "No lists to sync"
    });
  }

  console.log(`Syncing ${localLists.size} list(s)...`);

  // Try proxies in order
  const tryProxy = (index) => {
    if (index >= PROXY_PORTS.length) {
      return safeRespond(500, { error: "All proxies unavailable", online: false });
    }

    const port = PROXY_PORTS[index];
    console.log(`Trying proxy on port ${port}...`);

    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    let syncResults = [];
    let pendingReplies = 0;
    let requestCounter = 0;
    const requestTracker = new Map();

    socket.on("open", () => {
      console.log(`Connected to proxy ${port}`);
      isOnline = true;

      localLists.forEach((list, localListId) => {
        const requestId = `sync-${requestCounter++}`;
        requestTracker.set(requestId, localListId);
        pendingReplies++;

        socket.send(JSON.stringify({
          type: "sync",
          list: list.toJson(),
          requestId
        }));
      });

      if (pendingReplies === 0) {
        safeRespond(null, { online: isOnline, syncResults });
        socket.close();
      }
    });

    socket.on("message", (data) => {
      try {
        const reply = JSON.parse(data.toString());

        if (reply.code === 200 && reply.list && reply.requestId) {
          const localListId = requestTracker.get(reply.requestId);
          const returnedGlobalId = reply.list.listId;

          if (!localListId) {
            pendingReplies--;
            if (pendingReplies === 0) {
              safeRespond(null, { online: isOnline, syncResults });
              socket.close();
            }
            return;
          }

          const listToUpdate = localLists.get(localListId);
          const globalList = ShoppingList.fromJson(reply.list);

          if (listToUpdate && returnedGlobalId !== localListId) {
            listToUpdate.listId = returnedGlobalId;
            localLists.delete(localListId);
            localLists.set(returnedGlobalId, globalList);

            db.run(
              "UPDATE list SET globalId = ? WHERE id = ?",
              [returnedGlobalId, parseInt(localListId)]
            );

            syncResults.push({
              name: listToUpdate.name,
              globalId: returnedGlobalId,
              status: "synced"
            });

          } else if (listToUpdate) {
            if (globalList.deleted) {
              localLists.delete(returnedGlobalId);
              db_worker.postMessage({ type: "delete_permanent", listId: globalList.listId });
            } else {
              localLists.set(returnedGlobalId, globalList);
              syncResults.push({
                name: listToUpdate.name,
                globalId: returnedGlobalId,
                status: "already-synced"
              });
              db_worker.postMessage({ type: "update", list: globalList.toJson() });
            }
          }
        }

        pendingReplies--;
        if (pendingReplies === 0) {
          safeRespond(null, { online: isOnline, syncResults });
          socket.close();
        }

      } catch (err) {
        console.error("Error parsing sync reply:", err);
        pendingReplies--;
        if (pendingReplies === 0) {
          safeRespond(null, { online: isOnline, syncResults });
          socket.close();
        }
      }
    });

    socket.on("error", (err) => {
      console.error(`Proxy ${port} failed:`, err.message);
      socket.close();

      // Try next proxy
      if (!responded) {
        tryProxy(index + 1);
      }
    });

    setTimeout(() => {
      if (socket.readyState === WebSocket.OPEN) {
        console.log(`Proxy ${port} timed out`);
        socket.close();
        if (!responded) tryProxy(index + 1);
      }
    }, 8000);
  };

  // Start with first proxy
  tryProxy(0);
});

// Initialize database, load lists, then start server
initializeDatabase()
  .then(() => loadListsFromDatabase())
  .then(() => {
    app.listen(port, () => {
      console.log(`Client API running at http://localhost:${port}`);
    });
  })
  .catch(err => {
    console.error("Failed to initialize:", err);
    process.exit(1);
  });