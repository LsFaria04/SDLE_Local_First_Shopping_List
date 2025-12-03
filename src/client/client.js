import WebSocket from "ws";
import ShoppingList from "../models/ShoppingList.js";

function runClient(identity) {
  // Just a test shopping list
  const list = new ShoppingList(1, 1, "teste");
  list.addItem("teste", 1);
  list.addItem("product1", 1);
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

runClient("client-1");
