import { existsSync, readFileSync } from "node:fs";
import pkg from "sqlite3"; // sqlite3 is CommonJS
import { loadLists } from "./database_operations.js";
import ShoppingList from "../models/ShoppingList.js";
import { Worker } from "worker_threads";
import WebSocket, { WebSocketServer } from "ws";

const { Database } = pkg;

let shoppingLists = new Map(); // where all the lists in the server are stored

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

  // TODO: initialize the replication worker

  // WebSocket server
  const wss = new WebSocketServer({ port });

  wss.on("connection", (ws) => {
    console.log(`Worker ${identity} connected to proxy`);

    ws.on("message", (data) => {
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

          const syncList = syncLists(list);
          ws.send(
            JSON.stringify({
              code: 200,
              list: syncList,
            })
          );

          //update the list in the database
          db_worker.postMessage({type: "update", list: syncList.toJson()});

        } else if (type === "get") {
          const list = getList(msg.listId);

          if (!list) {
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
              list: list,
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
function syncLists(list) {
  let serverList = shoppingLists.get(list.listId.toString());

  const newShoppingList = new ShoppingList(
    process.env.SERVER_ID,
    list.listId,
    list.name
  );
  for (const product of list.items) {
    newShoppingList.addItem(product.item, product.inc);
    newShoppingList.markBought(product.item, product.dec);
  }

  if (serverList) {
    serverList.merge(newShoppingList);
    shoppingLists.set(list.listId, serverList);
  } else {
    shoppingLists.set(list.listId, newShoppingList);
    serverList = newShoppingList;
  }
  return serverList;
}

/**
 * Gets a list from the server or returns undefined if not found
 */
function getList(listId) {
  return shoppingLists.get(listId);
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
    console.log(products)
    const shoppingList = new ShoppingList(
      process.env.SERVER_ID,
      list.globalId,
      list.name
    );
    for (const product of products) {
      shoppingList.addItem(product.name, product.quantity);
      shoppingList.markBought(product.name, product.bought);
    }
    shoppingLists.set(list.globalId, shoppingList);
  }

  return shoppingLists;
}
