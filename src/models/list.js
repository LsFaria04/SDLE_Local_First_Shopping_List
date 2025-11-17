import { Product } from "./product";

export class List{
    constructor(id, name, globalId, softDelete){
        this.id = id;
        this.name = name;
        this.globalId = globalId;
        this.softDelete = softDelete;
    }
}