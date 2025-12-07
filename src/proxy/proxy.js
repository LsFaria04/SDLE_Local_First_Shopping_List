import cluster from "cluster";
import ConsistentHashRing from "../dynamo-core/consistent_hash.js";
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

        const requestId = message.requestId;

        // Decide the node using consistent hashing
        let preferenceList = [];
        if (message.type === "sync") {
          if (message.list.listId === null) {
            // no global id so a new one is created
            message.list.listId = randomUUID();
          }
          preferenceList = hashing.getPreferenceList(message.list.listId.toString(), 3);
        } else if (message.type === "get") {
          preferenceList = hashing.getPreferenceList(message.listId.toString(), 3);
        } else {
          clientSocket.send(JSON.stringify({ code: 400, error: "Unknown message type" }));
          return;
        }

        if (preferenceList.length <= 0) {
          clientSocket.send(JSON.stringify({ code: 500, error: "No server available" }));
          return;
        }

        // try connecting to backend servers in preference order
        function forwardToBackend(index = 0) {
          if (index >= preferenceList.length) {
            clientSocket.send(JSON.stringify({ code: 500, error: "All servers unavailable" }));
            return;
          }

          const node = preferenceList[index];
          const backendSocket = new WebSocket(`ws://127.0.0.1:${6000 + node}`);

          backendSocket.on("open", () => {
            const { requestId: reqId, ...backendMessage } = message;
            backendSocket.send(JSON.stringify(backendMessage));
          });

          backendSocket.on("message", (reply) => {
            const response = JSON.parse(reply.toString());
            response.requestId = requestId;
            clientSocket.send(JSON.stringify(response));
            backendSocket.close();
          });

          backendSocket.on("error", (err) => {
            console.error(`Backend connection error at node ${node}:`, err.message);
            backendSocket.close();
            // Try next replica
            forwardToBackend(index + 1);
          });

          backendSocket.on("close", () => {
            console.log(`Backend ${node} disconnected`);
          });
        }

        // Start with the primary node
        forwardToBackend(0);
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
