const zmq = require("zeromq");
const sqlite3 = require('sqlite3').verbose();
const path = require("path");

class Client {
    constructor() {
        this.sock = null;
    }

    async connect() {
        this.sock = new zmq.Dealer({ routingId: "client-1" });
        await this.sock.connect("tcp://localhost:5555");
        console.log("Connected");
    }

    async sendCommand(command) {
        if (!this.sock) await this.connect();
        
        await this.sock.send(JSON.stringify(command));
        
        for await (const [msg] of this.sock) {
            return JSON.parse(msg.toString());
        }
    }

    async createList(listId, name) {
        return await this.sendCommand({
            type: 'createList',
            listId,
            name
        });
    }

    async addItem(listId, itemName, quantity = 1) {
        return await this.sendCommand({
            type: 'addItem', 
            listId,
            itemName,
            quantity
        });
    }

    async markBought(listId, itemName, quantity = 1) {
        return await this.sendCommand({
            type: 'markBought',
            listId,
            itemName, 
            quantity
        });
    }

    async getList(listId) {
        return await this.sendCommand({
            type: 'getList',
            listId
        });
    }

    async removeItem(listId, itemName) {
        return await this.sendCommand({
            type: 'removeItem',
            listId,
            itemName
        });
    }
}

async function testDBConnection(){
    const dbPath = path.resolve(__dirname, "../database/local_db.db");

    // Open a database file (creates it if it doesn't exist)
    const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Could not connect to database', err);
    } else {
        console.log('✅ Connected to SQLite database');
    }
    });

    const client = new Client();

    try {
        console.log("\nTesting Dynamo Shopping Lists...");
        
        console.log("Creating list...");
        const list = await client.createList('family-list', 'Family Shopping');
        console.log('List created:', list);
        
        console.log("Adding items...");
        await client.addItem('family-list', 'milk', 2);
        await client.addItem('family-list', 'bread', 1);
        await client.addItem('family-list', 'eggs', 12);
        
        console.log("Marking items bought...");
        await client.markBought('family-list', 'milk', 1);
        
        console.log("Getting current list...");
        const currentList = await client.getList('family-list');
        console.log('Current list:', JSON.stringify(currentList, null, 2));
        
        console.log("🔄 Simulating concurrent updates...");
        await Promise.all([
            client.addItem('family-list', 'butter', 1),
            client.markBought('family-list', 'bread', 1),
            client.addItem('family-list', 'juice', 2)
        ]);
        
        const finalList = await client.getList('family-list');
        console.log('Final list after conflicts:', JSON.stringify(finalList, null, 2));
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        db.close();
    }

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
