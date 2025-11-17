
module.exports = class DotContext {

    constructor(){
        // Compact Causal Context - Map of replica_id -> max counter
        this.cc = new Map();

        // Dot cloud - Set of dots as strings "replicaId:counter"
        this.dc = new Set();
    }
    
    // Checks if dot is already in the context
    dotin(dot){ 
        const [replicaId, counter] = dot;
        
        // Check if it's in the compact context
        const maxCounter = this.cc.get(replicaId);
        if (maxCounter !== undefined && counter <= maxCounter) {
            return true;
        }

        // Check if it's in the dot cloud
        const dotStr = `${replicaId}:${counter}`;
        if (this.dc.has(dotStr)) {
            return true;
        }

        return false;
    }

    // Adds a new dot when adding/removing items locally from the cart
    makedot(replicaId){
        // Try to get existing counter for this replica
        const existingCounter = this.cc.get(replicaId);
        
        if (existingCounter === undefined) {
            // First time seeing this replica, start at 1
            this.cc.set(replicaId, 1);
            return [replicaId, 1];
        } else {
            // Increment existing counter
            const newCounter = existingCounter + 1;
            this.cc.set(replicaId, newCounter);
            return [replicaId, newCounter];
        }
    }

    // Inserts a dot into the dot cloud and compacts if needed
    insertDot(dot, compactNow = true){
        const [replicaId, counter] = dot;
        const dotStr = `${replicaId}:${counter}`;
        this.dc.add(dotStr);

        if (compactNow) this.compact();
    }

    // Merge dot cloud entries into compact context when possible
    compact(){
        let compactAgain = true;

        while (compactAgain){
            compactAgain = false;

            for (const dotStr of this.dc){
                // Parse dot string "replicaId:counter"
                const [replicaId, counterStr] = dotStr.split(':');
                const counter = parseInt(counterStr);
                
                const ccCounter = this.cc.get(replicaId);

                if (ccCounter === undefined){
                    if (counter === 1){
                        // Can compact - first dot for this replica
                        this.cc.set(replicaId, 1);
                        this.dc.delete(dotStr);
                        compactAgain = true;
                    }
                }
                else{
                    if (counter === ccCounter + 1){
                        // Can compact - contiguous with existing cc
                        this.cc.set(replicaId, ccCounter + 1);
                        this.dc.delete(dotStr);
                        compactAgain = true;
                    }
                    else if (counter <= ccCounter){
                        // Already dominated by cc, prune it
                        this.dc.delete(dotStr);
                        // Don't set flag - no new compaction opportunities
                    }
                }
            }
        }
    }

    // Merges two DotContexts for synchronization
    join(dotContext2){
        // No need to join with itself
        if (this === dotContext2) { 
            return;
        }
        
        // Merge compact contexts - take max counter for each replica
        for (const [replicaId, counter] of dotContext2.cc) {
            const existingCounter = this.cc.get(replicaId);
            if (existingCounter === undefined) {
                this.cc.set(replicaId, counter);
            } else {
                this.cc.set(replicaId, Math.max(existingCounter, counter));
            }
        }

        // Merge dot clouds
        for (const dotStr of dotContext2.dc) {
            // Parse and re-insert to ensure consistency
            const [replicaId, counterStr] = dotStr.split(':');
            const counter = parseInt(counterStr);
            this.insertDot([replicaId, counter], false);
        }

        this.compact();
    }




}