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
const dbPath = path.join(__dirname, "../database/local_db.db");

const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

let localLists = new Map(); // Local shopping lists
let isOnline = false; // Online status
const port = 3000;

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
      const shoppingList = new ShoppingList(1, listId, list.name);
      
      for (const product of products) {
        // Add item with its quantity
        for (let i = 0; i < product.quantity; i++) {
          shoppingList.addItem(product.name, 1);
        }
        // Mark bought items
        for (let i = 0; i < product.bought; i++) {
          shoppingList.markBought(product.name, 1);
        }
      }
      
      localLists.set(listId, shoppingList);
    }
    
    console.log(`Loaded ${localLists.size} lists from database`);
  } catch (err) {
    console.error("Error loading lists:", err);
  }
}

/*
function runClient(identity) {
  // Just a test shopping list
  const list = new ShoppingList(1, 2, "teste");
  list.addItem("teste", 1);
  list.addItem("product1", 1);
  list.addItem("product2", 10);
  list.markBought("product1", 1);
  list.removeItem("teste");

  // Connect to proxy via WebSocket
  const socket = new WebSocket("ws://127.0.0.1:5555");

  socket.on("open", () => {
    console.log(`${identity} connected to proxy`);

    // Message type: "sync" to sync local data with the cloud
    const message = { type: "sync", list: list.toJson() };
    socket.send(JSON.stringify(message));

    // Message type: "get" to receive a list with a global id shared by another user
    const message2 = { type: "get", listId: "2" };
    socket.send(JSON.stringify(message2));
  });

  socket.on("message", (data) => {
    try {
      const reply = JSON.parse(data.toString());
      console.log(`${identity} received reply:`, reply);
    } catch (err) {
      console.error("Error parsing reply:", err);
    }
  });

  socket.on("close", () => {
    console.log(`${identity} disconnected from proxy`);
  });

  socket.on("error", (err) => {
    console.error(`${identity} connection error:`, err);
  });
}*/


// Get all lists
app.get("/lists", (req, res) => {
  const listsArray = Array.from(localLists.values()).map((list) =>
    list.toJson()
  );
  res.json({ lists: listsArray });
});

// Get a specific list by ID
app.get("/lists/:listID", (req, res) => {
  const listID = req.params.listID;
  const list = localLists.get(listID);
  if (list) {
    res.json({ list: list.toJson() });
  } else {
    res.status(404).json({ error: "List not found" });
  }
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
    const newList = new ShoppingList(1, dbId, name);
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
    localLists.delete(listId);
    
    // Soft delete in database via worker
    console.log(`Deleting list ${listId} from database`);
    db_worker.postMessage({ type: "delete", listId });
    
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
  try {
    const socket = new WebSocket("ws://127.0.0.1:5555");
    let syncResults = [];
    let pendingReplies = 0;
    let requestCounter = 0;
    const requestTracker = new Map(); // Maps requestId → local listId (to match replies)

    socket.on("open", () => {
      console.log("Connected to proxy for sync");
      isOnline = true;

      // Send each list with a unique requestId to track the response
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
        socket.close();
      }
    });

    socket.on("message", (data) => {
      try {
        const reply = JSON.parse(data.toString());
        console.log("Sync reply:", reply);
        
        if (reply.code === 200 && reply.list && reply.requestId) {
          const localListId = requestTracker.get(reply.requestId);
          const returnedGlobalId = reply.list.listId;
          
          if (!localListId) {
            console.error("Received reply for unknown request:", reply.requestId);
            pendingReplies--;
            if (pendingReplies === 0) socket.close();
            return;
          }
          
          const listToUpdate = localLists.get(localListId);
          
          if (listToUpdate && returnedGlobalId !== localListId) {
            // Proxy assigned a new globalId (UUID) - update everything
            listToUpdate.listId = returnedGlobalId;
            localLists.delete(localListId);
            localLists.set(returnedGlobalId, listToUpdate);
            
            // Persist the globalId to database
            db.run(
              "UPDATE list SET globalId = ? WHERE id = ?",
              [returnedGlobalId, parseInt(localListId)],
              (err) => {
                if (err) console.error("Failed to update globalId:", err);
                else console.log(`Synced: ${listToUpdate.name} (${localListId} → ${returnedGlobalId})`);
              }
            );
            
            syncResults.push({ 
              name: listToUpdate.name,
              globalId: returnedGlobalId, 
              status: 'synced' 
            });
          } else if (listToUpdate) {
            syncResults.push({ 
              name: listToUpdate.name,
              globalId: returnedGlobalId, 
              status: 'already-synced' 
            });
          }
        }

        pendingReplies--;
        if (pendingReplies === 0) {
          socket.close();
        }
      } catch (err) {
        console.error("Error parsing sync reply:", err);
        pendingReplies--;
        if (pendingReplies === 0) {
          socket.close();
        }
      }
    });

    socket.on("close", () => {
      console.log("Disconnected from proxy after sync");
      res.json({ online: isOnline, syncResults });
    });

    socket.on("error", (err) => {
      console.error("Sync connection error:", err);
      isOnline = false;
      socket.close();
      res.status(500).json({ error: "Sync failed", online: false });
    });

    setTimeout(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
        res.status(408).json({ error: "Sync timeout", online: false });
      }
    }, 10000);

  } catch (error) {
    console.error("Sync error:", error);
    isOnline = false;
    res.status(500).json({ error: error.message, online: false });
  }
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

// Then try to connect to proxy
//runClient("client-1");