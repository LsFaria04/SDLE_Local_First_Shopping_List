import WebSocket from "ws";
import ShoppingList from "../models/ShoppingList.js";
import express from "express";
import cors from "cors";

const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

let localLists = new Map(); // Local shopping lists
let isOnline = false; // Online status
const port = 3000;

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
  res.status(201).json({ list: newList.toJson() });
});

// Delete a list
app.delete("/lists/:listId", (req, res) => {
  const listId = req.params.listId;
  if (localLists.has(listId)) {
    localLists.delete(listId);
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
  res.json({ list: list.toJson() });
});

// Toggle online/offline status
app.post("/toggle-online", (req, res) => {
  isOnline = !isOnline;
  res.json({ online: isOnline });
});

// Start the Express server FIRST
app.listen(port, () => {
  console.log(`Client API running at http://localhost:${port}`);
});

// Then try to connect to proxy
//runClient("client-1");

