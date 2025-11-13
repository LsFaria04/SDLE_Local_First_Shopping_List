import { Entity, PrimaryGeneratedColumn, Column } from "typeorm"
import { List } from "./list";
import { ProductUpdate } from "./product_update";

@Entity()
export class Product{
    @PrimaryGeneratedColumn()
    id;

    @Column()
    name;

    @Column()
    quantity;

    @Column()
    bought;

    @Column()
    soft_delete;

    @Column()
    list_id;

    @ManyToOne(() => List, (list) => list.products)
    list;

    @OneToMany(() => ProductUpdate, (productUpdate) => productUpdate.product)
    productUpdates;
}