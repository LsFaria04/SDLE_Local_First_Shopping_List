const GCounter = require('./GCounter.js')


module.exports = class PNCounter {

    constructor(id = null){

        this.p = new GCounter(id);
        this.n = new GCounter(id);

    }

    inc(amount = 1) {
        const res = new PNCounter();  
        res.p = this.p.inc(amount);
        res.n = this.n; 
        return res;
    }

    dec(amount = 1) {
        const res = new PNCounter();
        res.p = this.p; 
        res.n = this.n.inc(amount); 
        return res;
    }

    local() {
        return this.p.local() - this.n.local();
    }

    read() {
        return this.p.read() - this.n.read();
    }

    join(other) {
        this.p.join(other.p);
        this.n.join(other.n);
    }


}