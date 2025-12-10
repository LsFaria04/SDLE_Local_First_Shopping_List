import pkg from 'sqlite3';
import { parentPort, workerData } from 'worker_threads';
import { createList, updateList } from '../server/database_operations.js';

const { Database } = pkg;

// Open the database passed from parent
const db = new Database(workerData.dbPath);

/**
 * Updates or creates a list in the database
 */
function updateListInDB(list, oldListId = null) {
  // If oldListId is provided (transitioning from DB ID to UUID), use it
  if (oldListId !== null) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    // First, update the globalId on the existing row
    db.run(
      "UPDATE list SET globalId = ? WHERE id = ?",
      [list.listId, parseInt(oldListId)],
      (err) => {
        if (err) {
          console.error("Failed to update globalId:", err);
          return;
        }
        console.log(`Updated globalId: ${oldListId} → ${list.listId}`);
        
        // Now update the list contents
        updateList(db, list).catch(updateErr => {
          console.error("Failed to update list after setting globalId:", updateErr);
        });
      }
    );
    return;
  }
  
  // Check if listId is a UUID or database id
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  let query, params;
  if (uuidRegex.test(list.listId)) {
    query = "SELECT * FROM list WHERE globalId = ?;";
    params = [list.listId];
  } else {
    query = "SELECT * FROM list WHERE id = ?;";
    params = [parseInt(list.listId)];
  }
  
  const stmt = db.prepare(query);
  stmt.all(params, (err, rows) => {
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
  // Try to delete by globalId first (UUID), then fall back to id (database ID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  if (uuidRegex.test(listId)) {
    db.run(
      "UPDATE list SET soft_delete = 1 WHERE globalId = ?",
      [listId],
      (err) => {
        if (err) console.error("Error deleting list:", err);
        else console.log(`List ${listId} soft deleted (by globalId)`);
      }
    );
  } else {
    db.run(
      "UPDATE list SET soft_delete = 1 WHERE id = ?",
      [parseInt(listId)],
      (err) => {
        if (err) console.error("Error deleting list:", err);
        else console.log(`List ${listId} soft deleted (by id)`);
      }
    );
  }
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
