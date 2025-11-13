import { Entity, PrimaryGeneratedColumn, Column } from "typeorm"
import { List } from "./list";
import { Product } from "./product";

@Entity()
export class ProductUpdate{
    @PrimaryGeneratedColumn()
    id;

    @Column()
    product_id;

    @Column()
    quantity_diff;

    @Column()
    bought_diff;

    @Column()
    is_sync;

    @ManyToOne(() => Product, (product) => product.updates)
    product;
}