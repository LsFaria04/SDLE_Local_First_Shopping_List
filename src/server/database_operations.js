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

