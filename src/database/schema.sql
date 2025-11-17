DROP TABLE IF EXISTS list;
DROP TABLE IF EXISTS product;
DROP TABLE IF EXISTS product_update;


CREATE TABLE list(
    id INT PRIMARY KEY,
    name TEXT NOT NULL,
    globalId INT,
    soft_delete BOOLEAN NOT NULL DEFAULT 0
);

CREATE TABLE product(
    id INT PRIMARY KEY,
    name TEXT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    bought INT NOT NULL DEFAULT 0,
    soft_delete BOOLEAN NOT NULL DEFAULT 0,
    list_id REFERENCES list(id)  NOT NULL
);

CREATE TABLE product_update(
    id INT PRIMARY KEY,
    product_id INT REFERENCES product(id) NOT NULL,
    quantity_diff INT NOT NULL DEFAULT 0,
    bought_diff INT NOT NULL DEFAULT 0,
    is_sync BOOLEAN NOT NULL DEFAULT 0
);