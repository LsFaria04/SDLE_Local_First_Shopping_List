const zmq = require("zeromq");
const express = require('express');
const cors = require('cors');
const ConsistentHashRing = require("./dynamo-core/consistent-hash-ring");
const QuorumCoordinator = require("./dynamo-core/quorum-coordinator"); 
const Node = require("./dynamo-core/node");
const MembershipManager = require("./dynamo-core/membership-manager");
const MerkleTree = require("./dynamo-core/merkle-tree");
const ShoppingList = require("./models/shoppinglist");

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
