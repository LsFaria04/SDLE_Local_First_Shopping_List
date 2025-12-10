import PNCounter from '../crdt/PNCounter.js';
import AWORSet from '../crdt/AWORSet.js';

export default class ShoppingList {

    constructor(replicaId, listId, name){
        this.replicaId = replicaId;
        this.listId = listId;
        this.name = name;
        
        this.items = new AWORSet(replicaId);
        this.quantities = new Map();  // itemName → PNCounter (inc=add, dec=buy)
    }

    toJson(){

        // Serialize quantities map
        const quantitiesJson = {};
        for (const [itemName, counter] of this.quantities) {
            quantitiesJson[itemName] = counter.toJson();
        }
        return {
            replicaId: this.replicaId,
            listId: this.listId,
            name: this.name,
            items: this.items.toJson(),        // Full AWORSet state
            quantities: quantitiesJson,         // Full PNCounter states
            // Keep backwards-compatible "items" array for UI
            itemsDisplay: this.getItemsForDisplay()
        };
    }

    static fromJson(json) {
        const list = new ShoppingList(json.replicaId, json.listId, json.name);
        list.items = AWORSet.fromJson(json.items);
        
        list.quantities = new Map();
        for (const [itemName, counterJson] of Object.entries(json.quantities)) {
            list.quantities.set(itemName, PNCounter.fromJson(counterJson, json.replicaId));
        }
        
        return list;
    }

    getItemsForDisplay() {
        const items = this.items.read();
        console.log(items);
        const result = [];
        for (const item of items) {
            const counter = this.quantities.get(item);
            console.log(counter.p.read())
            result.push({
                item: item,
                inc: counter ? counter.p.read() : 0,
                dec: counter ? counter.n.read() : 0
            });
        }
        // sort alphabetically to maintain consistent order
        result.sort((a, b) => a.item.localeCompare(b.item));
        return result;
    }

    addItem(name, qty = 1){
        // Add item to the set
        this.items.add(name);
        
        // Create PNCounter if it doesn't exist
        if (!this.quantities.has(name)) {
            this.quantities.set(name, new PNCounter(this.replicaId));
        }
        
        // Increment quantity (adding items to the list)
        const counter = this.quantities.get(name);
        counter.join(counter.inc(qty));
    }

    removeItem(name){
        // Remove from AWORSet
        this.items.rmv(name);
        
        // Keep counter for merge purposes
    }

    markBought(name, qty = 1){
        if (!this.quantities.has(name)) {
            this.quantities.set(name, new PNCounter(this.replicaId));
        }
        // Decrement quantity (marking items as bought)
        const counter = this.quantities.get(name);
        counter.join(counter.dec(qty));
    }

    updateQuantity(name, diff){
        if (!this.quantities.has(name)) {
            this.quantities.set(name, new PNCounter(this.replicaId));
        }
        
        const counter = this.quantities.get(name);
        if (diff > 0) {
            counter.join(counter.inc(diff));
        } else if (diff < 0) {
            counter.join(counter.dec(Math.abs(diff)));
        }
    }

    getItems(){
        // Return items that exist in AWORSet with their quantities
        const itemSet = this.items.read();
        const result = [];
        
        for (const itemName of itemSet) {
            if (this.quantities.has(itemName)) {
                const counter = this.quantities.get(itemName);
                result.push({
                    name: itemName,
                    quantity: counter.p.read(), // Total added quantity
                    bought: counter.n.read()     // Total bought quantity
                });
            } else {
                result.push({
                    name: itemName,
                    quantity: 0,
                    bought: 0
                });
            }
        }
        
        return result;
    }

    merge(otherList){
        // Merge items (AWORSet)
        this.items.join(otherList.items);
        
        // Merge quantities (PNCounters)
        for (const [itemName, otherCounter] of otherList.quantities) {
            if (!this.quantities.has(itemName)) {
                this.quantities.set(itemName, new PNCounter(this.replicaId));
            }
            this.quantities.get(itemName).join(otherCounter);
        }
    }

}   