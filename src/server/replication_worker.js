import {parentPort, workerData} from 'worker_threads';
import {WebSocket,  WebSocketServer} from "ws";

const port = workerData.port; //current base port is 6000
const numberOfNeighbors = workerData.numberOfNeighbors;
const basePort = 7000;

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
function updateNeighborServers(currentPort, numberOfNeighbors, list) {
    for (let i = 1; i <= numberOfNeighbors; i++) {
        const updatePort = currentPort + 1000; // update port of current server
        const neighborPort = basePort + ((updatePort - basePort + i) % (numberOfNeighbors + 1));

        if(neighborPort == currentPort){
            neighborPort += 1; //avoid loop requests
        }

        updateNeighborServer(neighborPort, list);
    }
}

/**
 * Listens on the update port for updates from the neighbors
 * @param {number} port Port used to listen
 */
function listenForNeighborUpdates(port) {
    const serverPort = port + 1000;
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
      updateNeighborServers(port, Number(numberOfNeighbors), message.list);
    }
});

listenForNeighborUpdates(Number(port));