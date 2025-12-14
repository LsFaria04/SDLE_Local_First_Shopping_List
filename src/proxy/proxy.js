import cluster from "cluster";
import ConsistentHashRing from "../dynamo-core/consistent_hash.js";
import { randomUUID } from "node:crypto";
import WebSocket, { WebSocketServer } from "ws";


const PROXY_BASE_PORT = 5555;
const NUM_PROXIES = 3; // number of proxy replicas
const SERVERS = ["0", "1", "2", "3", "4"]; // backend node IDs

if (cluster.isPrimary) {
  // Fork proxy replicas
  for (let i = 0; i < NUM_PROXIES; i++) {
    cluster.fork({
      ROLE: "PROXY",
      PROXY_PORT: PROXY_BASE_PORT + i,
    });
  }



  // Fork backend servers
  SERVERS.forEach((id, idx) => {
    cluster.fork({
      ROLE: "BACKEND",
      SERVER_ID: id,
      PORT: 6000 + idx,
    });
  });

  let numbWorker = 0;
  for (const id in cluster.workers) {
    if(numbWorker < 3){
      console.log(`Proxy ${id} PID: ${cluster.workers[id].process.pid}`);
    }
    else{
      console.log(`Server ${id - 3} PID: ${cluster.workers[id].process.pid}`);
    }
    numbWorker++;
    
  }

  cluster.on("exit", (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} exited with code ${code} (${signal})`);
  });

} else {
  // Worker logic
  const role = process.env.ROLE;

  if (role === "PROXY") {
    const port = parseInt(process.env.PROXY_PORT, 10);
    runProxy(port);
  } else if (role === "BACKEND") {
    // Each backend server listens on its own WebSocket port
    // server.js should read process.env.PORT and process.env.SERVER_ID
    await import("../server/server.js");
  }
}

function runProxy(port) {
  // Initialize consistent hash ring (same for all proxy replicas)
  const hashing = new ConsistentHashRing([0, 1, 2, 3, 4]);

  // Frontend: clients connect here via WebSocket
  const frontend = new WebSocketServer({ port });

  frontend.on("connection", (clientSocket) => {
    console.log(`Client connected to proxy on port ${port}`);

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
        // Check if listId is a UUID format (globalId), if not assign a new globalId
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        if (!message.list.listId || !uuidRegex.test(message.list.listId)) {
          const globalId = randomUUID();
          message.list.listId = globalId;
          console.log(`Assigned globalId ${globalId} to list: ${message.list.name}`);
        }

        preferenceList = hashing.getPreferenceList(
          message.list.listId.toString(),
          3
        );

      } else if (message.type === "get") {
        preferenceList = hashing.getPreferenceList(
          message.listId.toString(),
          3
        );
      } else {
        clientSocket.send(
          JSON.stringify({ code: 400, error: "Unknown message type" })
        );
        return;
      }

      if (preferenceList.length <= 0) {
        clientSocket.send(
          JSON.stringify({ code: 500, error: "No server available" })
        );
        return;
      }

      // Try connecting to backend servers in preference order
      function forwardToBackend(index = 0) {
        if (index >= preferenceList.length) {
          clientSocket.send(
            JSON.stringify({ code: 500, error: "All servers unavailable" })
          );
          return;
        }

        const node = preferenceList[index];
        const backendSocket = new WebSocket(`ws://127.0.0.1:${6000 + node}`);

        backendSocket.on("open", () => {
          const { requestId: _reqId, ...backendMessage } = message;
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
      console.log(`Client disconnected from proxy on port ${port}`);
    });

    clientSocket.on("error", (err) => {
      console.error("Client socket error:", err);
    });
  });

  console.log(`Proxy running: frontend WebSocket on port ${port}`);

  // Graceful shutdown
  const shutdown = (signal) => {
    console.log(`Proxy on port ${port} received ${signal}, shutting down...`);
    try {
      frontend.close();
    } catch (err) {
      console.error("Error closing frontend WebSocketServer:", err);
    }
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("uncaughtException", (err) => {
    console.error("Uncaught exception in proxy:", err);
    shutdown("uncaughtException");
  });
  process.on("exit", (code) => {
    console.log(`Proxy process on port ${port} exiting with code ${code}`);
  });
}
