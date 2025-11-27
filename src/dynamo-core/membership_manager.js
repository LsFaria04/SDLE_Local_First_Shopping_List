class MembershipManager {
    constructor(localNodeId) {
        this.localNodeId = localNodeId;
        this.members = new Set([localNodeId]);
        this.suspectedNodes = new Set();
        this.gossipInterval = 1000; // 1 second
    }

    startGossip() {
        setInterval(() => this.gossip(), this.gossipInterval);
    }

    async gossip() {
        // Select a random node for gossip
        const randomMember = this.getRandomMember();
        if (!randomMember || randomMember === this.localNodeId) return;

        try {
            // Exchange membership information
            const response = await this.sendGossip(randomMember, {
                members: Array.from(this.members),
                suspected: Array.from(this.suspectedNodes)
            });

            // Process response
            this.mergeMembership(response.members, response.suspected);
            
        } catch (error) {
            // Mark as suspected if no response
            this.suspectedNodes.add(randomMember);
            console.log(`Node ${randomMember} suspected down`);
        }
    }

    mergeMembership(remoteMembers, remoteSuspected) {
        // Add new members
        remoteMembers.forEach(member => this.members.add(member));
        
        // Update suspected list
        remoteSuspected.forEach(suspected => this.suspectedNodes.add(suspected));
        
        // Clear suspected nodes that are responding
        this.members.forEach(member => {
            if (this.suspectedNodes.has(member)) {
                // Verify if still suspected
                this.verifyNode(member);
            }
        });
    }

    addNode(nodeId) {
        this.members.add(nodeId);
        this.suspectedNodes.delete(nodeId);
    }

    removeNode(nodeId) {
        this.members.delete(nodeId);
        this.suspectedNodes.delete(nodeId);
    }

    getHealthyNodes() {
        return Array.from(this.members).filter(node => 
            !this.suspectedNodes.has(node)
        );
    }
}