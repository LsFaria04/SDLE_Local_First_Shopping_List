//const PNCounter = require('./PNCounter.js'),  Still need to implement PNCOunter
const dotkernel = require('./DotKernel.js')


module.exports = class AWORSet {

    constructor(id, context = null){
        this.id = id; // Replica ID
        this.dk = context || new dotkernel(); // Dot kernel with shared causal context
    }

    // Reads the current items in the set
    read(){
        const set = new Set();

        for (const [dotStr, item] of this.dk.ds.entries()){
            set.add(item);
        }
        
        return set;
    }

    // Add item to the set
    add(val){
        const res = new AWORSet();

        res.dk = this.dk.rmv(val);

        res.dk.join(this.dk.add(this.id, val));

        return res;
    }

    // Checks if item is in the set
    in(val){
        for (const [dotStr, item] of this.dk.ds.entries()){
            if (item === val){
                return true;
            }
        }

        return false;
    }

    // Remove item from the set
    rmv(val){
        const res = new AWORSet();

        res.dk = this.dk.rmv(val);
        
        return res;
    }

    // Merge with another replica state
    join(otherAWORSet){
        this.dk.join(otherAWORSet.dk);
    }

    // Delete the entire set (for cleanup)
    reset(){
        const res = new AWORSet();
        res.dk = this.dk.rmvAll();
        return res;
    }

}
