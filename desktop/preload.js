"use strict";

const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, callback) {
  const listener = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld(
  "anonEditor",
  Object.freeze({
    pickMedia: () => ipcRenderer.invoke("media:pick"),
    saveProject: (project) => ipcRenderer.invoke("project:save", project),
    openProject: () => ipcRenderer.invoke("project:open"),
    exportVideo: (project) => ipcRenderer.invoke("export:video", project),
    onPickRequested: (callback) => {
      return subscribe("media:request-pick", callback);
    },
    onOpenProjectRequested: (callback) => subscribe("project:request-open", callback),
    onSaveProjectRequested: (callback) => subscribe("project:request-save", callback),
    onExportRequested: (callback) => subscribe("export:request", callback),
    onExportProgress: (callback) => subscribe("export:progress", callback),
  }),
);
