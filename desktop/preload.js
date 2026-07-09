"use strict";

const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, callback) {
  const listener = () => callback();
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld(
  "anonEditor",
  Object.freeze({
    pickMedia: () => ipcRenderer.invoke("media:pick"),
    saveProject: (project) => ipcRenderer.invoke("project:save", project),
    openProject: () => ipcRenderer.invoke("project:open"),
    onPickRequested: (callback) => {
      return subscribe("media:request-pick", callback);
    },
    onOpenProjectRequested: (callback) => subscribe("project:request-open", callback),
    onSaveProjectRequested: (callback) => subscribe("project:request-save", callback),
  }),
);
