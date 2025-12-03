import cluster from "cluster";
import { ConsistentHashRing } from "../dynamo-core/consistent-hash.js";
import { randomUUID } from "node:crypto";
import WebSocket, { WebSocketServer } from "ws";

if (cluster.isPrimary) {
  // Initialize the proxy in the primary worker
  const hashing = new ConsistentHashRing([0, 1, 2]);

  function runProxy() {
    // Frontend: clients connect here via WebSocket
    const frontend = new WebSocketServer({ port: 5555 });

    frontend.on("connection", (clientSocket) => {
      console.log("Client connected");

      clientSocket.on("message", (data) => {
        let message;
        try {
          message = JSON.parse(data.toString());
        } catch (err) {
          console.error("Invalid JSON from client:", err);
          clientSocket.send(JSON.stringify({ code: 400, error: "Bad Request" }));
          return;
        }


        // Decide the node using consistent hashing
        let node = 0;
        if (message.type === "sync") {
          if (message.list.listId === null) {
            // no global id so a new one is created
            message.list.listId = randomUUID();
          }
          node = hashing.getNode(message.list.listId.toString());
        } else if (message.type === "get") {
          node = hashing.getNode(message.listId.toString());
        } else {
          clientSocket.send(JSON.stringify({ code: 400, error: "Unknown message type" }));
          return;
        }


        // Connect to backend server via WebSocket
        const backendSocket = new WebSocket(`ws://127.0.0.1:${6000 + node}`);

        backendSocket.on("open", () => {
          backendSocket.send(JSON.stringify(message));
        });

        backendSocket.on("message", (reply) => {
          clientSocket.send(reply); // forward reply back to client
          backendSocket.close();
        });

        backendSocket.on("error", (err) => {
          console.error("Backend connection error:", err);
          clientSocket.send(JSON.stringify({ code: 500, error: "Error contacting server" }));
        });
      });

      clientSocket.on("close", () => {
        console.log("Client disconnected");
      });

      clientSocket.on("error", (err) => {
        console.error("Client socket error:", err);
      });
    });

    console.log("Proxy running: frontend WebSocket on port 5555");

    // Graceful shutdown
    const shutdown = (signal) => {
      console.log(`Received ${signal}, shutting down...`);
      try {
        frontend.close();
      } catch (err) {
        console.error("Error closing sockets:", err);
      }
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("uncaughtException", (err) => {
      console.error("Uncaught exception:", err);
      shutdown("uncaughtException");
    });
    process.on("exit", (code) => {
      console.log(`Process exiting with code ${code}`);
    });
  }

  // Fork workers (servers in the ring)
  const servers = ["0", "1", "2"];
  servers.forEach((id, idx) => {
    cluster.fork({ SERVER_ID: id, PORT: 6000 + idx });
  });

  runProxy();
} else {
  // Worker code: each server listens on its own WebSocket port
  import("../server/server.js"); // server.js should use process.env.PORT
}
