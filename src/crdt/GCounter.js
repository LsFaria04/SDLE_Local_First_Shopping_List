export default class GCounter {

    constructor(id = null){
        this.id = id;
        this.counters = new Map();

        // Initialize the replica's counter tif its mutable
        if (id !== null && id !== undefined) {
            this.counters.set(id, 0);
        }
    }

    inc(amount = 1){
        const res = new GCounter(this.id);  // Delta has no ID (not mutable)
        
        const currentVal = this.counters.get(this.id) || 0;
        this.counters.set(this.id, currentVal + amount);
        
        res.counters.set(this.id, currentVal + amount);
        
        return res;
    }

    local(){
        if (this.id === null || this.id === undefined) return 0;
        return this.counters.get(this.id) || 0;
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
            const currentVal = this.counters.get(replicaId) || 0;
            this.counters.set(replicaId, Math.max(currentVal, val));
        }
    }
    
    toJson() {
        return Object.fromEntries(this.counters);
    }

    static fromJson(json, id = null) {
        const counter = new GCounter(id);
        counter.counters = new Map(Object.entries(json).map(([k, v]) => [k, Number(v)]));
        return counter;
    }
    
}