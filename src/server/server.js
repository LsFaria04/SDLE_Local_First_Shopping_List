import { existsSync, readFileSync } from "node:fs";
import pkg from "sqlite3"; // sqlite3 is CommonJS
import { loadLists } from "./database_operations.js";
import ShoppingList from "../models/ShoppingList.js";
import { Worker } from "worker_threads";
import { WebSocketServer } from "ws";
import {Mutex} from "async-mutex";

const { Database } = pkg;

let shoppingLists = new Map(); // where all the lists in the server are stored
const lock = new Mutex();

/**
 * Main server function. Handles requests from proxy via WebSocket.
 * @param {string} identity Server id
 * @param {number} port Port used to connect to the server
 */
async function runWorker(identity, port) {
  // initialize database
  let db = null;
  try {
    db = await initDatabase(identity);
  } catch (err) {
    console.error(`Could not initialize the database. ${err.message}`);
  }

  // initialize the shopping lists (CRDTs)
  shoppingLists = await initShoppingLists(db);

  // initialize the database worker
  const db_worker = new Worker("./server/database_worker.js", {
    workerData: { dbPath: `./database/server${identity}.db` },
  });

  // initialize the replication worker
  const neighbor_worker = new Worker("./server/replication_worker.js", {
    workerData: {
      id: process.env.SERVER_ID,
      numberOfNeighbors: 2
    }
  });

  //initialize the reception of messages from the neighbors
  neighbor_worker.on("message", async (message) => {
    if(message.type === "update"){
      try{
        const syncList = await syncLists(message.list);
        db_worker.postMessage({type: "update", list: syncList.toJson()});
      } catch(err){
        console.log(`Could not receive the update from a neighbor: ${err}`);
      }
    }
  });

  // WebSocket server
  const wss = new WebSocketServer({ port });

  wss.on("connection", (ws) => {
    console.log(`Worker ${identity} connected to proxy`);

    ws.on("message", async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        console.log(`Worker ${identity} received list ${msg.list?.listId}`);

        const type = msg.type;

        if (type === "sync") {
          const list = msg.list;
          if (!list) {
            ws.send(
              JSON.stringify({
                code: 400,
                message: "Bad Request. No list provided",
              })
            );
            return;
          }

          const syncList = await syncLists(list);
          ws.send(
            JSON.stringify({
              code: 200,
              list: syncList.toJson(),
            })
          );

          //update the list in the database
          db_worker.postMessage({type: "update", list: syncList.toJson()});
          //update the list in the neighbors
          neighbor_worker.postMessage({type: "updateNeighbors", list : syncList.toJson()});

        } else if (type === "get") {
          const list = await getList(msg.listId);

          if (list == null) {
            ws.send(
              JSON.stringify({
                code: 404,
                message: "Bad Request. No list found",
              })
            );
            return;
          }

          ws.send(
            JSON.stringify({
              code: 200,
              list: list.toJson(),
            })
          );
        } else {
          ws.send(
            JSON.stringify({
              code: 400,
              message: "Bad request. Unknown type",
            })
          );
        }
      } catch (err) {
        console.error(`Worker ${identity} error parsing message:`, err);
      }
    });

    ws.on("close", () => {
      console.log(`Proxy disconnected from worker ${identity}`);
    });

    ws.on("error", (err) => {
      console.error(`Worker ${identity} socket error:`, err);
    });
  });

  console.log(`Worker ${identity} listening on WebSocket port ${port}`);
}

// Run worker with env vars
runWorker(process.env.SERVER_ID, process.env.PORT);

/**
 * Syncs the server list with the list sent by the client
 */
async function syncLists(incomingJson) {
    const incoming = ShoppingList.fromJson(incomingJson);
    let returningList = incoming;
    await lock.runExclusive(async () => {
       if (shoppingLists.has(incoming.listId)) {
        const existing = shoppingLists.get(incoming.listId);
        existing.merge(incoming);
        returningList = existing;
      } else {
          shoppingLists.set(incoming.listId, incoming);
          returningList = incoming;   
      }
    });
    return returningList;
   
}

/**
 * Gets a list from the server or returns undefined if not found
 */
async function getList(listId) {
  let returningList = null;
  await lock.runExclusive(async () => {
    returningList = shoppingLists.get(listId);
  });
  return returningList;
}

/**
 * Initializes the server local database
 */
function initDatabase(identity) {
  return new Promise((resolve, reject) => {
    const dbPath = `./database/server${identity}.db`;
    let db = new Database(dbPath);

    if (existsSync(dbPath)) {
      return resolve(db);
    }

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
 * Initializes shopping lists from DB
 */
async function initShoppingLists(db) {
  const lists_products = await loadLists(db);
  let shoppingLists = new Map();

  for (const { list, products } of lists_products) {
    const shoppingList = new ShoppingList(
      process.env.SERVER_ID,
      list.globalId,
      list.name,
      false
    );
    for (const product of products) {
      // Restore item directly from database values without incrementing
      shoppingList.restoreItem(product.name, product.quantity, product.bought);
    }
    shoppingLists.set(list.globalId, shoppingList);
  }

  return shoppingLists;
}
