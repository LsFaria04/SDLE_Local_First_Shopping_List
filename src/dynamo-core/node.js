const VectorClock = require('./vector_clock');
const AWORSet = require('../crdt/AWORSet');

class DynamoNode {
    constructor(nodeId, storagePort) {
        this.nodeId = nodeId;
        this.storagePort = storagePort;
        this.data = new Map(); // { listId: { value: CRDT, context: VectorClock, timestamp } }
        this.hintedStorage = new Map(); // { targetNode: [{ key, value, context }] }
    }

    async put(key, value, context = null) {
        const existing = this.data.get(key);
        
        // create or update vector clock
        let newContext;
        if (context) {
            newContext = VectorClock.fromJSON(context);
            newContext.increment(this.nodeId);
        } else {
            newContext = new VectorClock();
            newContext.increment(this.nodeId);
        }

        // Check for conflicts with existing version
        if (existing) {
            const existingContext = VectorClock.fromJSON(existing.context);
            const comparison = newContext.compare(existingContext);
            
            if (comparison === 'less') {
                // Reject write if it's older
                return { success: false, reason: 'stale_write' };
            }
            
            // If concurrent, merge CRDTs
            if (comparison === 'concurrent') {
                value = this.mergeCRDTs(existing.value, value);
            }
        }

        this.data.set(key, {
            value: value, // CRDT state
            context: newContext.toJSON(),
            timestamp: Date.now()
        });

        return { 
            success: true, 
            context: newContext.toJSON(),
            node: this.nodeId 
        };
    }

    async get(key) {
        const item = this.data.get(key);
        if (!item) {
            return null;
        }

        return {
            value: item.value,
            context: item.context,
            timestamp: item.timestamp,
            node: this.nodeId
        };
    }

    // Hinted Handoff
    async storeHint(targetNode, key, value, context) {
        if (!this.hintedStorage.has(targetNode)) {
            this.hintedStorage.set(targetNode, []);
        }
        
        this.hintedStorage.get(targetNode).push({
            key, value, context,
            timestamp: Date.now()
        });

        console.log(`[${this.nodeId}] Stored hint for ${targetNode} - key: ${key}`);
    }

    // Deliver hinted writes when the node recovers
    async deliverHintsToNode(targetNode, targetNodeInstance) {
        const hints = this.hintedStorage.get(targetNode) || [];
        const delivered = [];

        for (const hint of hints) {
            try {
                await targetNodeInstance.put(hint.key, hint.value, hint.context);
                delivered.push(hint);
                console.log(`[${this.nodeId}] Delivered hint to ${targetNode} - key: ${hint.key}`);
            } catch (error) {
                console.log(`[${this.nodeId}] Failed to deliver hint to ${targetNode}: ${error}`);
            }
        }

        // Remove delivered hints
        this.hintedStorage.set(targetNode, 
            this.hintedStorage.get(targetNode).filter(h => !delivered.includes(h))
        );

        return delivered.length;
    }

    mergeCRDTs(existingValue, newValue) {
        // AWORSet merge
        const existingSet = existingValue;
        const newSet = newValue;
        
        existingSet.join(newSet);
        return existingSet;
    }

    async health() {
        return { status: 'healthy', node: this.nodeId, dataSize: this.data.size };
    }
}

module.exports = DynamoNode;