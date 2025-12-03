import net from "node:net";
import ShoppingList from "../models/ShoppingList.js";

function runClient(identity) {
  //just a test shopping list
  const list = new ShoppingList(1,null,"teste");
  list.addItem("teste", 1);

  const client = net.createConnection({ host: "127.0.0.1", port: 5555 }, () => {
  console.log(`${identity} connected to proxy`);

    //Message type : "sync" to sync local data with the cloud and "get" to receive a list with a global id shared by another user

    // Send request to test sync message
    const message = JSON.stringify( {type: "sync", list: list.toJson()} );
    client.write(message);

    //Send request to test get message
    const message2 = JSON.stringify( {type: "get", listId: "1"} );
    //client.write(message2);
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
