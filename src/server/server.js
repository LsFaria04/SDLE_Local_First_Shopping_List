import net from "node:net";

function runWorker(identity, port) {
  const server = net.createServer((socket) => {
    console.log(`Worker ${identity} connected to proxy`);

    socket.on("data", (data) => {
      try {
        // Expect JSON: { clientId, productId }
        const msg = JSON.parse(data.toString());
        console.log(`Worker ${identity} received product ${msg.productId} from client ${msg.clientId}`);

        // Do work and reply
        const reply = JSON.stringify({
          clientId: msg.clientId,
          response: `Ack from ${identity}`
        });

        socket.write(reply);
      } catch (err) {
        console.error(`Worker ${identity} error parsing message:`, err);
      }
    });

    socket.on("end", () => {
      console.log(`Proxy disconnected from worker ${identity}`);
    });

    socket.on("error", (err) => {
      console.error(`Worker ${identity} socket error:`, err);
    });
  });

  server.listen(port, () => {
    console.log(`Worker ${identity} listening on port ${port}`);
  });
}

// Run worker with env vars
runWorker(process.env.SERVER_ID, process.env.PORT);
