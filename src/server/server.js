import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import pkg from 'sqlite3'; //because sqlite3 is a commonJS module
import { loadLists } from "./database_operations.js";
import ShoppingList from "../models/ShoppingList.js";
import {Worker} from "worker_threads";
import { JsonContains } from "typeorm";
const { Database } = pkg;


let shoppingLists = new Map(); //where all the lists in the server are stored
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
  shoppingLists = await initShoppingLists(db);
  
  //TODO: initialize the database worker (does the main database operations async in a worker)
  const db_worker = new Worker("./server/database_worker.js", { workerData: { dbPath: `./database/server${identity}.db` }});

  //TODO: initialize the replication worker

  const server = net.createServer((socket) => {
    console.log(`Worker ${identity} connected to proxy`);

    socket.on("data", (data) => {
      try {
        //Json received with the a list from the client
        const msg = JSON.parse(data.toString());
        console.log(`Worker ${identity} received list ${msg.list.listId}`);

        const type = msg.type;
        const list = msg.list;


        //filter the operation by type
        if(type === "sync"){
          //sync received list with server lists
          const syncList = syncLists(list);
          const reply = JSON.stringify({
            code: 200,
            list: syncList
          });
          socket.write(reply);
        }
        else if(type === "get"){
          //get list by a provided id
          const list = getList(list.listId);
          const reply = JsonContains.stringify({
            code: 200,
            list: list
          })
        }
        else{
          const reply = JSON.stringify({
            code: 400,
            message: `Bad request. Unknown type`
          });
          socket.write(reply);
        }

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


function syncLists(list){
  console.log("Received sync");
  /*
  const serverList = shoppingLists.get(list.listId);
  if(serverList){

  }
  else{
    const newShoppingList = new ShoppingList()
    shoppingLists.set(list.listId)
  }*/
  return list;
}


function getList(listId){
  console.log("Received get");

}

//Initialization functions -----------------------------------------------

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
