export class ProductUpdate{
    constructor(id, product_id, quantity_diff, bought_diff, is_sync){
        this.id = id;
        this.product_id = product_id;
        this.quantity_diff = quantity_diff;
        this.bought_diff = bought_diff;
        this.is_sync = is_sync;
    }

}