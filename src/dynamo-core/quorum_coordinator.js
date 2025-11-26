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
        this.N = N;  // number of replicas
        this.R = R;  // read quorum  
        this.W = W;  // write quorum
        this.hintedHandoff = new Map();
    }

    async put(listId, data, vectorClock) {
        const preferenceList = this.ring.getPreferenceList(listId, this.N);

        // sloppy quorum: pick first W healthy nodes
        const healthyNodes = await this.findHealthyNodes(preferenceList);
        const nodesToWrite = healthyNodes.slice(0, this.W);
        
        const writePromises = nodesToWrite.map(node =>
            this.sendToNode(node, 'PUT', listId, data)
        );
        
        const results = await Promise.allSettled(writePromises);
        const successCount = results.filter(r => r.status === 'fulfilled').length;
        
        // hinted handoff
        if (successCount < this.W) {
            const failedWrites = this.getFailedWrites(results, nodesToWrite);
            await this.storeHintedWrites(preferenceList, failedWrites, listId, data);
        }
        
        return successCount >= this.W;
    }

    async get(listId) {
        const preferenceList = this.ring.getPreferenceList(listId, this.N);

        // sloppy quorum: pick first R healthy nodes
        const healthyNodes = await this.findHealthyNodes(preferenceList);
        const nodesToRead = healthyNodes.slice(0, this.R);
        
        const readPromises = nodesToRead.map(node =>
            this.sendToNode(node, 'GET', listId)
        );
        
        const results = await Promise.all(readPromises);
        
        return results;
    }

    async getHealthyNodes(nodes) {
        const healthChecks = nodes.map(async node => ({
            node,
            healthy: await this.isNodeHealthy(node)
        }));
        
        const results = await Promise.all(healthChecks);
        return results.filter(r => r.healthy).map(r => r.node);
    }

    async storeHintedWrites(preferenceList, failedNodes, listId, data) {
        for (const failedNode of failedNodes) {
            const handoffNode = preferenceList.find(node => 
                node !== failedNode && !failedNodes.includes(node)
            );
            
            if (handoffNode) {
                this.storeHint(handoffNode, failedNode, listId, data);
            }
        }
    }

    storeHint(handoffNode, originalNode, listId, data) {
        if (!this.hintedHandoff.has(handoffNode)) {
            this.hintedHandoff.set(handoffNode, []);
        }
        
        this.hintedHandoff.get(handoffNode).push({
            data,
            originalNode,
            listId,
            timestamp: Date.now()
        });
        
        console.log(`Hinted handoff: ${listId} to ${handoffNode} (original: ${originalNode})`);
    }

    async deliverHintedWrites(recoveredNode) {
        const hints = this.hintedHandoff.get(recoveredNode) || [];
        
        for (const hint of hints) {
            await this.sendToNode(recoveredNode, 'PUT', hint.listId, hint.data);
            console.log(`Delivered hinted write: ${hint.listId} to ${recoveredNode}`);
        }
        
        this.hintedHandoff.delete(recoveredNode);
    }

    async isNodeHealthy(node) {
        try {
            await this.sendToNode(node, 'GET', 'health');
            return true;
        } catch {
            return false;
        }
    }

    getFailedWrites(results, nodes) {
        return results
            .map((result, index) => ({ result, node: nodes[index] }))
            .filter(({ result }) => result.status === 'rejected')
            .map(({ node }) => node);
    }

    resolveConflicts(versions) {
        return versions.sort((a, b) => b.timestamp - a.timestamp)[0];
    }

    async sendToNode(node, method, listId, data = null) {
        // Replace with ZeroMQ later
        const response = await fetch(`http://${node}/lists/${listId}`, {
            method: method,
            body: data ? JSON.stringify(data) : undefined
        });
        return response.json();
    }
}

module.exports = QuorumCoordinator;

