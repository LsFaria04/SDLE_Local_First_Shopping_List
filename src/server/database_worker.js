import pkg from 'sqlite3'; //because sqlite3 is a commonJS module
import {parentPort, workerData} from 'worker_threads';
import { createList, updateList } from './database_operations.js';
const { Database } = pkg;

// Open the database passed from parent
const db = new Database(workerData.dbPath);

function updateListInDB(list){
    const stmt = db.prepare("SELECT * FROM list WHERE globalId = ?;");
    stmt.all(list.listId, (err, rows) => {
            stmt.finalize(); // free resources
            

            if (err) {
                //no special action
                return;
            }

            if(rows.length === 0){
                createList(db, list);
            }
            else{
                updateList(db, list);
            }
        }
    );

}

parentPort.on('message', (message) => {
    if (message.type === 'update') {
      updateListInDB(message.list);
    }
});