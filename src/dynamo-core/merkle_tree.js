class MerkleTree {
    constructor(entries = new Map()) {
        this.leaves = new Map(entries);
        this.root = this.calculateRoot();
        this.levels = this.buildTreeLevels(); 
    }

    buildTreeLevels() {
        if (this.leaves.size === 0) return [[]];

        const sortedKeys = Array.from(this.leaves.keys()).sort();
        const leafHashes = sortedKeys.map(key => 
            this.hash(key + JSON.stringify(this.leaves.get(key)))
        );

        const levels = [leafHashes];
        let currentLevel = leafHashes;

        while (currentLevel.length > 1) {
            const nextLevel = [];
            for (let i = 0; i < currentLevel.length; i += 2) {
                const left = currentLevel[i];
                const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : this.hash('');
                nextLevel.push(this.hash(left + right));
            }
            levels.push(nextLevel);
            currentLevel = nextLevel;
        }

        return levels;
    }

    calculateRoot() {
        const levels = this.buildTreeLevels();
        return levels[levels.length - 1][0] || this.hash('');
    }

    async syncWith(otherTree) {
        if (this.root === otherTree.root) {
            return []; 
        }

        const differences = [];
        await this.compareTrees(otherTree, 0, 0, differences);
        return differences;
    }

    async compareTrees(otherTree, levelIndex, nodeIndex, differences, path = '') {
        if (levelIndex >= this.levels.length || levelIndex >= otherTree.levels.length) {
            return;
        }

        const myHash = this.levels[levelIndex]?.[nodeIndex];
        const otherHash = otherTree.levels[levelIndex]?.[nodeIndex];

        if (myHash === otherHash) {
            return;
        }

        if (levelIndex === 0) {
            const key = Array.from(this.leaves.keys())[nodeIndex];
            differences.push(key);
            return;
        }

        const leftChildIndex = nodeIndex * 2;
        const rightChildIndex = nodeIndex * 2 + 1;

        await this.compareTrees(otherTree, levelIndex - 1, leftChildIndex, differences, path + 'L');
        if (rightChildIndex < this.levels[levelIndex - 1].length) {
            await this.compareTrees(otherTree, levelIndex - 1, rightChildIndex, differences, path + 'R');
        }
    }

    update(key, value) {
        this.leaves.set(key, value);
        this.levels = this.buildTreeLevels();
        this.root = this.levels[this.levels.length - 1][0] || this.hash('');
    }

    hash(data) {
        return require('crypto').createHash('sha256').update(data).digest('hex');
    }
}

module.exports = MerkleTree;