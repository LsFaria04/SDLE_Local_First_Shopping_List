# SDLE Second Assignment of group T03G07.

Group members: 

1. Pedro Borges (up202207552@up.pt)
2. Lucas Faria (up202207540@up.pt)
3. Alexandre Lopes (up202207015@.up.pt)


## Introduction

Local-first shopping list application designed for collaborative use. Users can create shopping lists, share them with others, add or modify products, and mark items as purchased or partially acquired by specifying the bought quantity. All data is stored locally to ensure offline availability and durability, with synchronization enabled for seamless multi-user collaboration.


## Architecture

It has three main components:
 - **Client**: The client is the software running on the user's device. It captures user input and stores updates in a local SQLite database, which maintains the current CRDT states for each shopping list. This ensures offline availability and enables conflict-free synchronization with the cloud.
 - **Router/Load Balancer**: The load balancer acts as an intermediary between the client and the cloud infrastructure. When a client creates a new shopping list, the load balancer assigns it to a specific server node using a consistent hashing strategy (inspired by the DynamoDB model). This ensures an even distribution of lists across nodes while minimizing rebalancing when nodes are added or removed. Since each list is typically shared by a small group (2 to 6 users, such as a household), there's no need to replicate it across multiple nodes — a sharded approach is sufficient. For subsequent updates, a router component forwards requests directly to the node responsible for storing the list's data.
 - **Cloud Nodes**: Stores the CRDT states of shopping lists. The system follows an eventually consistent model, meaning the cloud node may not always be perfectly synchronized with the clients. This trade-off enables high performance and fault tolerance, while ensuring that all replicas eventually converge to the same state.

The CRDT architecture may require further discussion and refinement. However, a possible structure for the local database is outlined below:
  - **List**: 
    - **ID**: local id generated in the DB
    - **GlobalID**: id in the cloud generated when the list is firstly inserted in the cloud
    - **Products**: products associated to the list
    - **Soft_delete**: Boolean to indicate that a list was removed from the local DB 
 - **Product**:
    - **ID**
    - **name**
    - **Quantity**
    - **Bought**: Quantity already bought
    - **Soft_delete**: Boolean to indicate that a product was removed from the list
- **Product Updates**:
    - **ID**
    - **ProductID**
    - **Quantity_Diff**: how many new or removed (needed to ensure consistency in the cloud)
    - **Bought_Diff**: how many new products were bought or a fix because a user made an error
    - **Is_Sync**: boolean indicating if this update was already sent to the cloud (does not ensure consistency because updates may be lost when sending to the cloud, but at least indicates updates made offline)

## Technologies

- **Sqlite**: local DB
- **ZeroMQ**: messages between the client and the cloud
- **C**: Programming language
- **SQLite API**: Conection with the DB

The CRDTS must be made by us. Some other framework may be needed in the future. 
    

