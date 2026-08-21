const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('urbanmenKiosk', Object.freeze({
  desktop: true,
}));
