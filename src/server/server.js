const zmq = require("zeromq");
const express = require('express');
const cors = require('cors');
const ConsistentHashRing = require("./dynamo-core/consistent-hash-ring");
const QuorumCoordinator = require("./dynamo-core/quorum-coordinator"); 
const Node = require("./dynamo-core/node");
const MembershipManager = require("./dynamo-core/membership-manager");
const MerkleTree = require("./dynamo-core/merkle-tree");
const ShoppingList = require("./models/shoppinglist");
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import pkg from 'sqlite3'; //because sqlite3 is a commonJS module
import { loadLists } from "./database_operations.js";
import ShoppingList from "../models/ShoppingList.js";

const { Database } = pkg;
const app = express();
app.use(cors());
app.use(express.json());

class Server {
    constructor(identity, peerNodes = []) {
        this.identity = identity;
        this.peerNodes = peerNodes;
        
        this.initializeDynamoCore();
    }

    initializeDynamoCore() {
        // Membership and Consistent Hashing
        this.membership = new MembershipManager(this.identity);
        this.peerNodes.forEach(peer => this.membership.addNode(peer));
        
        const allNodes = [this.identity, ...this.peerNodes];
        this.ring = new ConsistentHashRing(allNodes);
        
        this.nodeMap = new Map();
        allNodes.forEach(nodeId => {
            this.nodeMap.set(nodeId, new DynamoNode(nodeId));
        });
        
        // Coordinator
        this.coordinator = new QuorumCoordinator(this.ring, this.nodeMap);
        
        this.startBackgroundTasks();
    }

    startBackgroundTasks() {
        // Gossip for membership
        this.membership.startGossip();
        
        // Anti-entropy every 30 seconds
        setInterval(() => this.antiEntropy(), 30000);
    }

    // Handler for ZeroMQ requests
    async handleRequest(message) {
        try {
            const command = JSON.parse(message.toString());
            
            switch (command.type) {
                case 'createList':
                    return await this.createList(command.listId, command.name);
                    
                case 'addItem':
                    return await this.addItem(command.listId, command.itemName, command.quantity);
                    
                case 'markBought':
                    return await this.markBought(command.listId, command.itemName, command.quantity);
                    
                case 'getList':
                    return await this.getList(command.listId);
                    
                case 'removeItem':
                    return await this.removeItem(command.listId, command.itemName);
                    
                default:
                    return { error: 'Unknown command' };
            }
        } catch (error) {
            return { error: error.message };
        }
    }
I
    async createList(listId, name) {
        const shoppingList = new ShoppingList(this.identity, listId, name);
        const result = await this.coordinator.put(listId, shoppingList);
        
        return {
            success: result.success,
            listId,
            name,
            context: result.context
        };
    }

    async addItem(listId, itemName, quantity = 1) {
        const current = await this.coordinator.get(listId);
        
        if (!current) {
            throw new Error(`List ${listId} not found`);
        }
        
        const shoppingList = current.value;
        shoppingList.addItem(itemName, quantity);
        
        const result = await this.coordinator.put(listId, shoppingList, current.context);
        
        return {
            success: result.success,
            item: itemName,
            quantity,
            context: result.context
        };
    }

    async markBought(listId, itemName, quantity = 1) {
        const current = await this.coordinator.get(listId);
        
        if (!current) {
            throw new Error(`List ${listId} not found`);
        }
        
        const shoppingList = current.value;
        shoppingList.markBought(itemName, quantity);
        
        const result = await this.coordinator.put(listId, shoppingList, current.context);
        
        return {
            success: result.success,
            item: itemName,
            bought: quantity,
            context: result.context
        };
    }

    async getList(listId) {
        const result = await this.coordinator.get(listId);
        
        if (!result) {
            return null;
        }
        
        const shoppingList = result.value;
        return {
            listId,
            name: shoppingList.name,
            items: shoppingList.getItems(),
            context: result.context,
            timestamp: result.timestamp
        };
    }

    async removeItem(listId, itemName) {
        const current = await this.coordinator.get(listId);
        
        if (!current) {
            throw new Error(`List ${listId} not found`);
        }
        
        const shoppingList = current.value;
        shoppingList.removeItem(itemName);
        
        const result = await this.coordinator.put(listId, shoppingList, current.context);
        
        return {
            success: result.success,
            removed: itemName,
            context: result.context
        };
    }

    async antiEntropy() {
        const healthyNodes = this.membership.getHealthyNodes();
        const otherNodes = healthyNodes.filter(node => node !== this.identity);
        
        if (otherNodes.length === 0) return;
        
        // Simulate anti-entropy (in production this would be real communication) [will be implemented later]
        console.log(`[${this.identity}] Anti-entropy with ${otherNodes.length} nodes`);
    }
}

/**
 * Main server function. Does the main server work like receiving the requests and making the needed work.
 * @param {string} identity Server id
 * @param {number} port Port used to connect to the server
 */
async function runWorker(identity, port) {
  //initialize database
  let db = null;
  try{
    db = await initDatabase(identity);
  } catch(err){
    console.error(`Could not initialize the database. ${err.message}`)
  }

  //initialize the shopping lists (CRDTs)
  let shoppingLists = await initShoppingLists(db);

  console.log(shoppingLists)

  
  //initialize the database worker
  //initialize the replication worker

  const server = net.createServer((socket) => {
    console.log(`Worker ${identity} connected to proxy`);

    socket.on("data", (data) => {
      try {
        //Json received with the a list from the client
        const msg = JSON.parse(data.toString());
        console.log(`Worker ${identity} received list ${msg.listId}`);

        // Send reply. Only a simple reply for now
        const reply = JSON.stringify({
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

/**
 * Initializes the server local database. If the database does not exists, it is created
 * @param {string} identity Server id
 * @returns Database connection
 */
function initDatabase(identity){
    return new Promise((resolve, reject) => {
      const dbPath = `./database/server${identity}.db`;
      let db = new Database(dbPath);

      if (existsSync(dbPath)) {
        return resolve(db);
      }

      // read the schema to initialize the db
      const schema = readFileSync("./database/schema.sql", "utf8");

      db.exec(schema, (err) => {
        if (err) {
          return reject(new Error(err.message));
        }
        console.log("Schema executed successfully");
        resolve(db);
      });
    });
}

/**
 * Initializes the shopping lists (CRDTs) to be used by the server using the stored information in hte local database
 * @param {Database} db Database connection
 * @returns Map ListID => Shopping list
 */
async function initShoppingLists(db){
  const lists_products = await loadLists(db);
  let shoppingLists = new Map(); //hash map of list ids to shopping list

  //Create the shopping lists
  for (const {list, products} of lists_products){
    const shoppingList = new ShoppingList(process.env.SERVER_ID, list.globalId,list.name);
    for(const product of products){
      shoppingList.addItem(product.name, product.quantity);
      shoppingList.markBought(product.name, product.bought)
    }
    shoppingLists.set(list.globalId, shoppingList);
  }

  return shoppingLists;
}
