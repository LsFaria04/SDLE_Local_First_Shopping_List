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
      // Create ShoppingList and restore items
      const shoppingList = new ShoppingList(1, list.globalId, list.name);
      
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
      
      localLists.set(list.globalId, shoppingList);
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
  list.addItem("product2", 1);
  list.markBought("product1", 1);

  // Connect to proxy via WebSocket
  const socket = new WebSocket("ws://127.0.0.1:5555");

  socket.on("open", () => {
    console.log(`${identity} connected to proxy`);

    // Message type: "sync" to sync local data with the cloud
    const message = { type: "sync", list: list.toJson() };
    socket.send(JSON.stringify(message));

    // Message type: "get" to receive a list with a global id shared by another user
    const message2 = { type: "get", listId: "1" };
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
}
*/

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
app.post("/lists", (req, res) => {
  const { listId, name } = req.body;
  if (!name || !listId) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  if (localLists.has(listId)) {
    return res.status(409).json({ error: "List with this ID already exists" });
  }
  const newList = new ShoppingList(1, listId, name);
  localLists.set(listId, newList);
  
  // Save to database via worker
  db_worker.postMessage({ type: "create", list: newList.toJson() });
  
  res.status(201).json({ list: newList.toJson() });
});

// Delete a list
app.delete("/lists/:listId", (req, res) => {
  const listId = req.params.listId;
  if (localLists.has(listId)) {
    localLists.delete(listId);
    
    // Soft delete in database via worker
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

// Toggle online/offline status
app.post("/toggle-online", (req, res) => {
  isOnline = !isOnline;
  res.json({ online: isOnline });
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