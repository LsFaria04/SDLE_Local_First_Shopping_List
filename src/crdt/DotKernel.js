
const dotContext = require("./DotContext")

module.exports = class DotKernel {

    constructor(cc = new dotContext()) {
        this.c = cc; // Shared causal context
        this.ds = new Map(); // Dot store: Map of (dot -> item)
    }

    // Add item to cart
    add(id, val){
        const res = new DotKernel();
        
        // Create new dot
        const newdot = this.c.makedot(id);
        const dotStr = `${newdot[0]}:${newdot[1]}`;

        // Add to this kernel's dot store
        this.ds.set(dotStr, val);

        // Create delta to return
        res.ds.set(dotStr, val);
        res.c.insertDot(newdot);

        return res;
    }

    // Remove item from cart (remove all dots with matching value)
    rmv(val){
        const res = new DotKernel();
        const dotsToRemove = [];

        // Find all dots matching this value
        for (const [dotStr, itemVal] of this.ds.entries()) {
            if (itemVal === val) { // Value matches
                const [replicaId, counterStr] = dotStr.split(':');
                const counter = parseInt(counterStr);
                const dot = [replicaId, counter];
                
                res.c.insertDot(dot, false); // Add to result context
                dotsToRemove.push(dotStr);
            }
        }
        
        // Now remove them from this kernel
        for (const dotStr of dotsToRemove) {
            this.ds.delete(dotStr);
        }
        
        res.c.compact();
        return res;
    }

    // Merge with another replica state
    join(otherKernel){
        if (this === otherKernel) return; // No reason to join with self

        // Process dots only in this.ds
        for (const [dotStr, val] of this.ds.entries()) {
            const [replicaId, counterStr] = dotStr.split(':');
            const counter = parseInt(counterStr);
            
            // If other's context knows this dot but doesn't have it in ds,
            // it means other removed it - so we should remove it too
            if (otherKernel.c.dotin([replicaId, counter])) {
                this.ds.delete(dotStr);
            }
        }

        // Process dots only in other.ds or in both
        for (const [dotStr, val] of otherKernel.ds.entries()) {
            const [replicaId, counterStr] = dotStr.split(':');
            const counter = parseInt(counterStr);

            // If we don't know this dot, import it
            if (!this.c.dotin([replicaId, counter])) {
                this.ds.set(dotStr, val);
            }
            // If dot is in both ds maps, keep it (already there)
        }

        // Merge causal contexts
        this.c.join(otherKernel.c);
    }
    
    // Remove all items from cart
    rmvAll(){
        const res = new DotKernel();

        for (const [dotStr, val] of this.ds.entries()) {
            const [replicaId, counterStr] = dotStr.split(':');
            const counter = parseInt(counterStr);
            const dot = [replicaId, counter];

            res.c.insertDot(dot, false); // Add to result context
        }
        res.c.compact();
        this.ds.clear(); // Clear all items from this kernel

        return res;
    }


} 