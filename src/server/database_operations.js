import pkg from 'sqlite3'; //because sqlite3 is a commonJS module
import { List } from '../models/list.js';
import { Product } from '../models/product.js';
const { Database } = pkg;

/**
 * Gets all the lists and corresponding products stored in the database
 * @param {Database} db Database connection
 * @returns Lists and the products stored in the database
 */
export function loadLists(db){
    return new Promise((resolve, reject) => {
        // Load the lists from the database
        db.all("SELECT * FROM list;", async (err, rows) => {
        if (err) {
            return reject(err);
        }

        let lists = [];
        for (let row of rows) {
            if (!row.soft_delete) {
            const list = new List(row.id, row.name, row.globalId, row.soft_delete);
            lists.push(list);
            }
        }

        // Load the list products (assuming loadProducts returns a Promise)
        try {
            let lists_products = [];
            for (const list of lists) {
            const products = await loadProducts(db, list.id);
            lists_products.push({
                list: list,
                products: products
            });
            }

            resolve(lists_products);
        } catch (err) {
            reject(err);
        }
        });
  });
}

/**
 * Returns all the products associated to a list
 * @param {Database} db 
 * @param {number} listId 
 * @returns Products associated to listId
 */
export function loadProducts(db, listId) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare("SELECT * FROM product WHERE list_id = ?;");

    stmt.all(listId, (err, rows) => {
      stmt.finalize(); // free resources

      if (err) {
        return reject(err);
      }

      const products = [];
      for (let row of rows) {
        if (!row.soft_delete) {
          const product = new Product(
            row.id,
            row.name,
            row.quantity,
            row.bought,
            row.soft_delete,
            row.list_id
          );
          products.push(product);
        }
      }

      resolve(products);
    });
  });
}

/**
 * Creates a new list and inserts it into the database
 * @param {Database} db Database connection 
 * @param {*} list  New list
 * @returns Promise with the results of the operation
 */
export function createList(db, list){
    return new Promise((resolve, reject) => {
        db.run(
            "INSERT INTO list (name, globalId) VALUES (?, ?)",
            [list.name, list.listId],
            function (err) {
                if (err) return reject(err);

                const actualListId = this.lastID; // local PK from SQLite

                // Use itemsDisplay for database storage (array format)
                const displayItems = list.itemsDisplay || [];
                
                // If no items, resolve immediately
                if (displayItems.length === 0) {
                return resolve({ listId: actualListId });
                }

                let remaining = displayItems.length;
                let failed = false;

                for (const item of displayItems) {
                db.run(
                    "INSERT INTO product (name, quantity, bought, list_id) VALUES (?, ?, ?, ?)",
                    [item.item, item.inc, item.dec, actualListId],
                    (itemErr) => {
                    if (failed) return; // already rejected
                    if (itemErr) {
                        failed = true;
                        return reject(itemErr);
                    }

                    remaining -= 1;
                    if (remaining === 0) {
                        // All items inserted
                        resolve({ listId: actualListId });
                    }
                    }
                );
                }
            }
        );
    });
}

/**
 * Updates a list with new name and product information
 * @param {*} db Database connection
 * @param {*} list List to update
 * @returns Results of the operation
 */
export function updateList(db, list){
    return new Promise((resolve, reject) => {
       db.run(
        "UPDATE list SET name = ? WHERE globalId = ?",
        [list.name, list.listId],
        (err) => {
            if (err) return reject(err);

            db.get(
            "SELECT id FROM list WHERE globalId = ?",
            [list.listId],
            (getErr, row) => {
                if (getErr) return reject(getErr);
                if (!row) return reject(new Error("List not found"));

                const actualListId = row.id;

                // Use itemsDisplay for database storage (array format)
                const displayItems = list.itemsDisplay || [];
                
                if (displayItems.length === 0) {
                return resolve();
                }

                let remaining = displayItems.length;
                let failed = false;

                for (const item of displayItems) {
                db.run(
                    `INSERT INTO product (name, quantity, bought, list_id)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(name, list_id) DO UPDATE SET
                    quantity = excluded.quantity,
                    bought   = excluded.bought`,
                    [item.item, item.inc, item.dec, actualListId],
                    (itemErr) => {
                    if (failed) return;
                    if (itemErr) {
                        failed = true;
                        return reject(itemErr);
                    }

                    remaining -= 1;
                    if (remaining === 0) {
                        resolve();
                    }
                    }
                );
                }
            }
            );
        }
        );
    });
}


