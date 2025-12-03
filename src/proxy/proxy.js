import net from "node:net";
import cluster from "cluster";
import { ConsistentHashRing } from "../dynamo-core/consistent-hash.js";
import { randomUUID } from "node:crypto";

if (cluster.isPrimary) {
  // Initialize the proxy in the primary worker
  const hashing = new ConsistentHashRing([0, 1, 2]);

  function runProxy() {
    // Frontend: clients connect here
    const frontend = net.createServer((clientSocket) => {
      console.log("Client connected");

      clientSocket.on("data", (data) => {
        const message = JSON.parse(data.toString().trim());
        console.log(message)

        //decide the node to send the message using dynamo's style consistent hashing mechanism
        let node = 0;
        if(message.type === "sync"){
          
          if(message.list.listId == null){
            //no global id so a new one is created
            message.list.listId = randomUUID();
          }

          node = hashing.getNode(message.list.listId.toString());
        }
        else if(message.type === "get"){
          node = hashing.getNode(message.listId.toString());
        }
        else{
          //unknown message
          throw new Error("Unknonw message received");
        }
        

        console.log(`Routing list with id ${message.list["listId"]} → server-${node}`);

        // Connect to backend server
        const backendSocket = net.createConnection(
          { host: "127.0.0.1", port: 6000 + node }, // each server listens on 6000+id
          () => {
            backendSocket.write(
              JSON.stringify(message)
            );
          }
        );

        backendSocket.on("data", (reply) => {
          clientSocket.write(reply); // forward reply back to client
          backendSocket.end();
        });

        backendSocket.on("error", (err) => {
          console.error("Backend connection error:", err);
          clientSocket.write("Error contacting server");
        });
      });

      clientSocket.on("end", () => {
        console.log("Client disconnected");
      });
      clientSocket.on("error", () => {
        clientSocket.write("Bad Request!");
      });
    });

    frontend.listen(5555, () => {
      console.log("Proxy running: frontend on port 5555");
    });

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
  // Worker code: each server listens on its own TCP port
  import("../server/server.js"); // server.js should use process.env.PORT
}
