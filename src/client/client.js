<<<<<<< HEAD
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
=======
import net from "node:net";
import ShoppingList from "../models/ShoppingList.js";
>>>>>>> 37c7e33aebbed3c5367b4c8de2a75d130119d221

function runClient(identity) {
  //just a test shopping list
  const list = new ShoppingList(1,null,"teste");
  list.addItem("teste", 1);

  const client = net.createConnection({ host: "127.0.0.1", port: 5555 }, () => {
  console.log(`${identity} connected to proxy`);

    //Message type : "sync" to sync local data with the cloud and "get" to receive a list with a global id shared by another user

    // Send request to test sync message
    const message = JSON.stringify( {type: "sync", list: list.toJson()} );
    client.write(message);

    //Send request to test get message
    const message2 = JSON.stringify( {type: "get", listId: "1"} );
    //client.write(message2);
  });

  client.on("data", (data) => {
    try {
      const reply = data.toString();
      console.log(`${identity} received reply: ${reply}`);
    } catch (err) {
      console.error("Error parsing reply:", err);
    }
<<<<<<< HEAD
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

=======
  });

  client.on("end", () => {
    console.log(`${identity} disconnected from proxy`);
  });

  client.on("error", (err) => {
    console.error(`${identity} connection error:`, err);
  });
>>>>>>> 37c7e33aebbed3c5367b4c8de2a75d130119d221
}

runClient("client-1");
