import net from "node:net";
import ShoppingList from "../models/ShoppingList.js";

function runClient(identity) {
  //just a test shopping list
  const list = new ShoppingList(1,1,"teste");
  list.addItem("teste", 1);
  console.log(list.toString())

  const client = net.createConnection({ host: "127.0.0.1", port: 5555 }, () => {
    console.log(`${identity} connected to proxy`);

    const productId = "product-123";

    // Send request as JSON
    const message = JSON.stringify({ clientId: identity, productId });
    client.write(message);
  });

  client.on("data", (data) => {
    try {
      const reply = data.toString();
      console.log(`${identity} received reply: ${reply}`);
    } catch (err) {
      console.error("Error parsing reply:", err);
    }
  });

  client.on("end", () => {
    console.log(`${identity} disconnected from proxy`);
  });

  client.on("error", (err) => {
    console.error(`${identity} connection error:`, err);
  });
}

runClient("client-1");
