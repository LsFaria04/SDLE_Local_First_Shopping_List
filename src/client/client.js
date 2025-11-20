async function testDBConnection(){
    // Import sqlite3
    const sqlite3 = require('sqlite3').verbose();
    const path = require("path");
    const dbPath = path.resolve(__dirname, "../database/local_db.db");

    // Open a database file (creates it if it doesn't exist)
    const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Could not connect to database', err);
    } else {
        console.log('✅ Connected to SQLite database');
    }
    });
}

testDBConnection();

const zmq = require("zeromq");

async function runClient() {
  const sock = new zmq.Dealer({ routingId: "client-1" });
  await sock.connect("tcp://localhost:5555");

  const productId = "product-123";
  await sock.send(productId);

  for await (const [msg] of sock) {
    console.log(`Client received reply: ${msg.toString()}`);
  }
}

runClient();
