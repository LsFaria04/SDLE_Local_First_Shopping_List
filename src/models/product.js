export class Product{

    constructor(id, name, quantity, bought, soft_delete, list_id){
        this.id = id;
        this.name = name;
        this.quantity = quantity;
        this.bought = bought;
        this.soft_delete = soft_delete;
        this.list_id = list_id;
    }
}