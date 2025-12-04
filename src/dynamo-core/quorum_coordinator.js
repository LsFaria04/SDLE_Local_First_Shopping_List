const ConsistentHashRing = require('./consistent-hash-ring');
const VectorClock = require('./vector_clock');

/*
    Quorum Coordinator with Sloppy Quorum and Hinted Handoff:
    - Sloppy Quorum: Uses the first W healthy nodes from the preference list for writes
    - Hinted Handoff: If a node is down during a write, the write is temporarily stored on another healthy node 
      with a hint to forward it later.
    - Write only fails if fewer than W nodes acknowledge the write.
*/

class QuorumCoordinator {
    constructor(consistentHashRing, N = 3, R = 2, W = 2) {
        this.ring = consistentHashRing;
        this.nodeMap = nodeMap;
        this.N = N;  // number of replicas
        this.R = R;  // read quorum  
        this.W = W;  // write quorum
        this.hintedHandoff = new Map();
    }

    async put(listId, data, context = null) {
        const preferenceList = this.ring.getPreferenceList(listId, this.N);

        // sloppy quorum: pick first W healthy nodes
        const healthyNodes = await this.findHealthyNodes(preferenceList);
        const nodesToWrite = healthyNodes.slice(0, this.W);

        if (nodesToWrite.length < this.W) {
            throw new Error(`Insufficient healthy nodes. Required: ${this.W}, Available: ${nodesToWrite.length}`);
        }
        
        const writePromises = nodesToWrite.map(nodeId => {
            const node = this.nodeMap.get(nodeId);
            return node.put(listId, data, context);
        });
        
        const results = await Promise.allSettled(writePromises);

        const successfulWrites = [];
        const failedNodes = [];

        results.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value.success) {
                successfulWrites.push(result.value);
            } else {
                failedNodes.push(nodesToWrite[index]);
            }
        });
        
        // hinted handoff
        if (failedNodes.length > 0) {
            await this.handleFailedWrites(preferenceList, failedNodes, listId, data, context);
        }

        const finalContext = this.mergeContexts(successfulWrites.map(w => w.context))
        
        return {
            success: successfulWrites.length >= this.W,
            context: finalContext,
            successfulWrites: successfulWrites.length,
            failedWrites: failedNodes.length
        };
    }

    async get(listId) {
        const preferenceList = this.ring.getPreferenceList(listId, this.N);

        // sloppy quorum: pick first R healthy nodes
        const healthyNodes = await this.findHealthyNodes(preferenceList);
        const nodesToRead = healthyNodes.slice(0, this.R);
        
        const readPromises = nodesToRead.map(nodeId => {
            const node = this.nodeMap.get(nodeId);
            return node.get(listId);
        });
        
        const results = await Promise.all(readPromises);

        const versions = [];
        results.forEach(result => {
            if (result.status === 'fulfilled' && result.value) {
                versions.push(result.value);
            }
        });

        if (versions.length === 0) {
            return null;
        }
        
        return this.reconcileVersions(versions);
    }

    reconcileVersions(versions) {
        if (versions.length === 1) {
            return versions[0];
        }

        let latestVersion = versions[0];
        
        for (let i = 1; i < versions.length; i++) {
            const currentContext = VectorClock.fromJSON(latestVersion.context);
            const compareContext = VectorClock.fromJSON(versions[i].context);
            
            const comparison = currentContext.compare(compareContext);
            
            if (comparison === 'less') {
                latestVersion = versions[i];
            } else if (comparison === 'concurrent') {
                return this.handleConcurrentVersions(versions);
            }
        }
        
        return latestVersion;
    }

     handleConcurrentVersions(versions) {
        let mergedValue = versions[0].value;
        
        for (let i = 1; i < versions.length; i++) {
            mergedValue = this.mergeCRDTs(mergedValue, versions[i].value);
        }
        
        const mergedContext = this.mergeContexts(versions.map(v => v.context));
        
        return {
            value: mergedValue,
            context: mergedContext,
            timestamp: Math.max(...versions.map(v => v.timestamp)),
            conflictResolved: true
        };
    }

    mergeContexts(contexts) {
        if (contexts.length === 0) return new VectorClock().toJSON();
        if (contexts.length === 1) return contexts[0];
        
        let merged = VectorClock.fromJSON(contexts[0]);
        
        for (let i = 1; i < contexts.length; i++) {
            const current = VectorClock.fromJSON(contexts[i]);
            merged = merged.merge(current);
        }
        
        return merged.toJSON();
    }

    async handleFailedWrites(preferenceList, failedNodes, listId, data, context) {
        for (const failedNode of failedNodes) {
            const handoffNode = preferenceList.find(node => 
                node !== failedNode && !failedNodes.includes(node)
            );
            
            if (handoffNode && this.nodeMap.has(handoffNode)) {
                const handoffNodeInstance = this.nodeMap.get(handoffNode);
                await handoffNodeInstance.storeHint(failedNode, listId, data, context);
            }
        }
    }

    async findHealthyNodes(nodes) {
        const healthChecks = nodes.map(async nodeId => {
            try {
                const node = this.nodeMap.get(nodeId);
                const health = await node.health();
                return { nodeId, healthy: true };
            } catch {
                return { nodeId, healthy: false };
            }
        });
        
        const results = await Promise.all(healthChecks);
        return results.filter(r => r.healthy).map(r => r.nodeId);
    }

    async nodeRecovered(nodeId) {
        console.log(`Node ${nodeId} recovered, delivering hinted writes...`);
        
        let totalDelivered = 0;
        for (const [handoffNodeId, handoffNode] of this.nodeMap) {
            if (handoffNodeId !== nodeId) {
                const delivered = await handoffNode.deliverHintsToNode(nodeId, this.nodeMap.get(nodeId));
                totalDelivered += delivered;
            }
        }
        
        console.log(`Delivered ${totalDelivered} hinted writes to node ${nodeId}`);
        return totalDelivered;
    }
}

module.exports = QuorumCoordinator;