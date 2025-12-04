class VectorClock {
    constructor(entries = new Map()) {
        this.clock = new Map(entries);
    }

    increment(nodeId) {
        const current = this.clock.get(nodeId) || 0;
        this.clock.set(nodeId, current + 1);
        return this;
    }

    compare(other) {
        let thisGreater = false;
        let otherGreater = false;

        const allNodes = new Set([...this.clock.keys(), ...other.clock.keys()]);
        
        for (const node of allNodes) {
            const thisVal = this.clock.get(node) || 0;
            const otherVal = other.clock.get(node) || 0;

            if (thisVal > otherVal) thisGreater = true;
            if (otherVal > thisVal) otherGreater = true;
        }

        if (thisGreater && otherGreater) return 'concurrent';
        if (thisGreater) return 'greater';
        if (otherGreater) return 'less';
        return 'equal';
    }

    merge(other) {
        const merged = new Map();
        const allNodes = new Set([...this.clock.keys(), ...other.clock.keys()]);
        
        for (const node of allNodes) {
            const thisVal = this.clock.get(node) || 0;
            const otherVal = other.clock.get(node) || 0;
            merged.set(node, Math.max(thisVal, otherVal));
        }
        
        return new VectorClock(merged);
    }

    toJSON() {
        return Object.fromEntries(this.clock);
    }

    static fromJSON(obj) {
        return new VectorClock(new Map(Object.entries(obj)));
    }
}

module.exports = VectorClock;