class ConsistentHashRing {
    constructor(nodes = [], virtualNodesPerNode = 10) {
        this.ring = new Map();
        this.virtualNodesPerNode = virtualNodesPerNode;
        this.sortedKeys = [];
        nodes.forEach(node => this.addNode(node));
    }
    
    addNode(node) {
        for (let i = 0; i < this.virtualNodesPerNode; i++) {
            const key = this.hash(`${node}:${i}`);
            this.ring.set(key, node);
            this.sortedKeys.push(key);
        }
        this.sortedKeys.sort();
    }
    
    getNode(key) {
        if (this.ring.size === 0) return null;

        const hash = this.hash(key);

        let left = 0, right = this.sortedKeys.length - 1;
        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const midVal = this.sortedKeys[mid];

            if (midVal === hash) {
                return this.ring.get(midVal);
            } 
            else if (midVal < hash) {
                left = mid + 1;
            } 
            else {
                right = mid - 1;
            }
        }

        return this.ring.get(this.sortedKeys[left % this.sortedKeys.length]);
    }

    getPreferenceList(key, n = 2) {
        const preferenceList = [];
        let currentIndex = this.findKeyIndex(this.hash(key));
        
        while (preferenceList.length < n) {
            const node = this.ring.get(this.sortedKeys[currentIndex]);
            if (!preferenceList.includes(node)) {
                preferenceList.push(node);
            }
            currentIndex = (currentIndex + 1) % this.sortedKeys.length;
        }
        
        return preferenceList;
    }
    
    findKeyIndex(hash) {
        let left = 0, right = this.sortedKeys.length - 1;
        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            if (this.sortedKeys[mid] >= hash) return mid;
            left = mid + 1;
        }
        return 0;
    }

    removeNode(node) {
        for (let i = 0; i < this.virtualNodesPerNode; i++) {
            const key = this.hash(`${node}:${i}`);
            this.ring.delete(key);
            const index = this.sortedKeys.indexOf(key);
            if (index !== -1) {
                this.sortedKeys.splice(index, 1);
            }
        }
    }
    
    hash(str) {
        return crypto.createHash('md5').update(str).digest('hex');
    }
}