# How to configure the development environment

To install the backend dependencies, go to the src directory and ``run npm install``. Make sure that the directory contains a valid package.json file.

To install the frontend (UI) dependencies, navigate to the ui directory and ``run npm install`` to set up everything required for the user interface.

To run the project run the following commands:

```bash
npm run start:proxy #Starts the proxy and its replicas. Also starts all the servers in the ring

npm run start:client #Starts the client backend process (worker)

npm run start:ui #Stars the ui


#These commands are used to start a second client
npm run start:client2
npm run start:ui2
```