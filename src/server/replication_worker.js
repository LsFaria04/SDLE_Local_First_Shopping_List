import {parentPort, workerData} from 'worker_threads';
import {WebSocket,  WebSocketServer} from "ws";
import ConsistentHashRing from "../dynamo-core/consistent_hash.js";

const serverID = workerData.id; //current base port is 6000
const numberOfNeighbors = workerData.numberOfNeighbors;
const hashing = new ConsistentHashRing([0, 1, 2,3,4]); //used to get the neighbors

/**
 * Updates a neighbor server list with the new list information from the current server
 * @param {number} port Port to send the update
 * @param {*} list List to send
 * @param {number} timeoutMs Timeout used to wait for an ack
 */
function updateNeighborServer(port, list, timeoutMs = 3000) {
    const updateSocket = new WebSocket(`ws://127.0.0.1:${port}`);

    let ackReceived = false;
    let timeoutHandle;

    updateSocket.on("open", () => {
        updateSocket.send(JSON.stringify({ type: "update", list }));

        // Start timeout countdown
        timeoutHandle = setTimeout(() => {
            if (!ackReceived) {
                console.error(`Timeout: No ack from neighbor at port ${port}`);
                updateSocket.close();
            }
        }, timeoutMs);
    });

    updateSocket.on("message", (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === "ack") {
                ackReceived = true;
                console.log(`Ack received from neighbor at port ${port}`);
                clearTimeout(timeoutHandle);
                updateSocket.close();
            }
        } catch (err) {
            console.error("Invalid message from neighbor:", message);
        }
    });

    updateSocket.on("close", () => {
        console.log(`Neighbor at port ${port} disconnected`);
    });

    updateSocket.on("error", (err) => {
        console.error(`Connection error with neighbor at port ${port}:`, err);
    });
}

/**
 * Updates all the neighbor servers of the current server
 * @param {number} currentPort Current server port
 * @param {number} numberOfNeighbors Number of neighbors of the current server
 * @param {*} list List to send
 */
function updateNeighborServers(serverID, numberOfNeighbors, list) {
    const preferenceList = hashing.getPreferenceList(list.listId.toString(), numberOfNeighbors + 1);
    for (let i = 1; i <= numberOfNeighbors; i++) {
        const neighbor = preferenceList[i];

        if(neighbor == serverID){
           continue;
        }

        const neighborPort = 7000 + neighbor

        updateNeighborServer(neighborPort, list);
    }
}

/**
 * Listens on the update port for updates from the neighbors
 * @param {number} server_id Server id used to know the port to use
 */
function listenForNeighborUpdates(server_id) {
    const serverPort = 7000 + Number(server_id);
    const wss = new WebSocketServer({ port: serverPort });

    wss.on("connection", (socket) => {
        console.log(`Neighbor connected on port ${serverPort}`);

        socket.on("message", (message) => {
            try {
                const data = JSON.parse(message);
                if (data.type === "update") {
                    const list = data.list;
                    parentPort.postMessage({ type: "update", list });

                    // Send ack back to sender
                    socket.send(JSON.stringify({ type: "ack" }));
                }
            } catch (err) {
                console.error("Invalid update message:", message);
            }
        });

        socket.on("error", (err) => {
            console.error("Update socket error:", err);
        });

        socket.on("close", () => {
            console.log("Neighbor disconnected");
        });
    });
}



parentPort.on('message', (message) => {
    if (message.type === 'updateNeighbors') {
      updateNeighborServers(serverID, Number(numberOfNeighbors), message.list);
    }
});

listenForNeighborUpdates(serverID);