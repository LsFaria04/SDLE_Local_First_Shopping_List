import pkg from 'sqlite3'; //because sqlite3 is a commonJS module
import {parentPort, workerData} from 'worker_threads';
const { Database } = pkg;

// Open the database passed from parent
const db = new Database(workerData.dbPath);

function updateList(list){


}

parentPort.on('message', (message) => {
    if (message.type === 'update') {
      updateDB(message.list);
    }
});