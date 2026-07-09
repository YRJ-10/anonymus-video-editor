"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld(
  "anonEditor",
  Object.freeze({
    pickMedia: () => ipcRenderer.invoke("media:pick"),
    onPickRequested: (callback) => {
      const listener = () => callback();
      ipcRenderer.on("media:request-pick", listener);
      return () => ipcRenderer.removeListener("media:request-pick", listener);
    },
  }),
);
