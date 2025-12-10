export default class GCounter {

    constructor(id = null){
        this.id = id;
        this.counters = new Map();

        // Initialize the replica's counter if its mutable
        if (id !== null && id !== undefined) {
            this.counters.set(String(id), 0);
        }
    }

    inc(amount = 1){
        const res = new GCounter(this.id);  // Delta has no ID (not mutable)
        
        const key = String(this.id);
        const currentVal = this.counters.get(key) || 0;
        this.counters.set(key, currentVal + amount);
        
        res.counters.set(key, currentVal + amount);
        
        return res;
    }

    local(){
        if (this.id === null || this.id === undefined) return 0;
        return this.counters.get(String(this.id)) || 0;
    }

    read(){
        let tot = 0;
        for (const [replicaId, val] of this.counters.entries()){
            tot += val;
        }
        return tot;
    }

    join(other){
        for (const [replicaId, val] of other.counters.entries()){
            const key = String(replicaId);
            const currentVal = this.counters.get(key) || 0;
            this.counters.set(key, Math.max(currentVal, val));
        }
    }
    
    toJson() {
        return Object.fromEntries(this.counters);
    }

    static fromJson(json, id = null) {
        const counter = new GCounter(null);  // Don't initialize with id to avoid setting counter to 0
        counter.id = id;
        counter.counters = new Map(Object.entries(json).map(([k, v]) => [String(k), Number(v)]));
        return counter;
    }
    
}