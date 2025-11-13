import { Entity, PrimaryGeneratedColumn, Column } from "typeorm"
import { Product } from "./product";

@Entity()
export class List{
    @PrimaryGeneratedColumn()
    id;

    @Column()
    name;

    @Column()
    globalId;

    @Column()
    softDelete;

    @OneToMany(() => Product, (product) => product.list)
    products;
}