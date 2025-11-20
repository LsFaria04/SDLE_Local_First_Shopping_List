const zmq = require("zeromq");
const crypto = require("crypto");


async function runProxy() {
  const frontend = new zmq.Router();
  await frontend.bind("tcp://*:5555"); // clients connect here

  const backend = new zmq.Dealer();
  await backend.bind("tcp://*:5556"); // servers/workers connect here

  console.log("Proxy running: frontend on 5555, backend on 5556");

  // Forward client → backend
  (async () => {
    for await (const [clientId, empty, productId] of frontend) {
      // Envelope: [serverId, clientId, productId]
      await backend.send(["server-0", clientId, productId]);
    }
  })();

  // Forward backend → client
  (async () => {
    for await (const [serverId, clientId, reply] of backend) {
      await frontend.send([clientId, "", reply]);
    }
  })();
}

runProxy();
