import pkg from 'sqlite3';
import { parentPort, workerData } from 'worker_threads';
import { createList, updateList } from '../server/database_operations.js';

const { Database } = pkg;

// Open the database passed from parent
const db = new Database(workerData.dbPath);

/**
 * Updates or creates a list in the database
 */
function updateListInDB(list) {
  const stmt = db.prepare("SELECT * FROM list WHERE globalId = ?;");
  stmt.all(list.listId, (err, rows) => {
    stmt.finalize();

    if (err) {
      console.error("Error checking list:", err);
      return;
    }

    if (rows.length === 0) {
      createList(db, list);
    } else {
      updateList(db, list);
    }
  });
}

/**
 * Soft deletes a list from the database
 */
function deleteListInDB(listId) {
  db.run(
    "UPDATE list SET soft_delete = 1 WHERE globalId = ?",
    [listId],
    (err) => {
      if (err) console.error("Error deleting list:", err);
      else console.log(`List ${listId} soft deleted`);
    }
  );
  console.log(`Requested deletion of list ${listId}`);
}

// Handle messages from parent
parentPort.on('message', (message) => {
  switch (message.type) {
    case 'create':
      createList(db, message.list);
      break;
    case 'update':
      updateListInDB(message.list);
      break;
    case 'delete':
      deleteListInDB(message.listId);
      break;
    default:
      console.error("Unknown message type:", message.type);
  }
});
