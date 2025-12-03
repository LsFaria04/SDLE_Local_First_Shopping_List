import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import pkg from 'sqlite3'; //because sqlite3 is a commonJS module
const { Database } = pkg;

/**
 * Main server function. Does the main server work like receiving the requests and making the needed work.
 * @param {string} identity Server id
 * @param {number} port Port used to connect to the server
 */
function runWorker(identity, port) {
  //initialize database
  try{
    const db = initDatabase(identity);
  } catch(err){
    console.error(`Could not initialize the database. ${err.message}`)
  }

  //initialize the shopping lists
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
  const dbPath = `./database/server${identity}_db`;
  let db = null;
  try{
    //See if the database already exists. If not, create it
    if(existsSync(dbPath)){
      db = new Database(dbPath);
    }
    else{
      db = new Database(dbPath);

      //read the schema to initialize the db
      const schema = readFileSync("./database/schema.sql", 'utf8');

      db.exec(schema,
        (err) => {
              if (err) {
                //Trhow the error to be handled by the main server function
                throw new Error(err.message);
              }
          }
      );
    }
  } catch(err){
    //The error will be handle by the main server function
    throw err;
  }

  return db;
}
