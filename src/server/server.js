const zmq = require("zeromq");

async function runWorker(identity) {
  const sock = new zmq.Dealer({ routingId: identity }); // Dealer with identity
  await sock.connect("tcp://localhost:5556");

  for await (const [msg] of sock) {
    console.log(`Worker ${identity} received: ${msg.toString()}`);
    // Do work and optionally reply
    await sock.send(`Ack from ${identity}`);
  }
}

runWorker("server-0");
