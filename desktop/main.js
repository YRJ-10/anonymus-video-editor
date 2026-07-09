"use strict";

const path = require("node:path");
const { pathToFileURL } = require("node:url");
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  session,
} = require("electron");
const {
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  classifyMediaFile,
  shouldBlockRequest,
} = require("./media-policy");

app.commandLine.appendSwitch("disable-background-networking");
app.commandLine.appendSwitch("disable-component-update");
app.commandLine.appendSwitch("disable-domain-reliability");
app.commandLine.appendSwitch("disable-sync");

let mainWindow;
const smokeTest = process.argv.includes("--smoke-test");

function extensionList(values) {
  return [...values].map((extension) => extension.slice(1));
}

function installOfflineBoundary() {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: shouldBlockRequest(details.url) });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 680,
    show: false,
    backgroundColor: "#101114",
    title: "Anon Editor",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault();
  });
  if (!smokeTest) mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.once("did-finish-load", async () => {
    if (smokeTest) {
      try {
        const result = await mainWindow.webContents.executeJavaScript(`
          ({
            hasDesktopApi: typeof window.anonEditor?.pickMedia === "function",
            hasTimelineModel: typeof window.TimelineModel?.splitClip === "function",
            hasTimelineUi: Boolean(
              document.querySelector("#track-lanes") &&
              document.querySelector("#playhead") &&
              document.querySelector("#timeline-zoom")
            ),
            hasPhase4Ui: Boolean(
              document.querySelector("#add-track") &&
              document.querySelector("#text-dialog") &&
              document.querySelector("#overlay-stage")
            ),
          })
        `);
        const ready = Object.values(result).every(Boolean);
        console.log(
          ready ? "ANON_EDITOR_DESKTOP_READY" : `ANON_EDITOR_DESKTOP_INVALID ${JSON.stringify(result)}`,
        );
        app.exit(ready ? 0 : 1);
      } catch (error) {
        console.error(`ANON_EDITOR_DESKTOP_ERROR ${error.message}`);
        app.exit(1);
      }
    }
  });
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

async function pickMedia() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Add video or photo",
    buttonLabel: "Add to project",
    properties: ["openFile"],
    filters: [
      {
        name: "Video and photos",
        extensions: [...extensionList(VIDEO_EXTENSIONS), ...extensionList(IMAGE_EXTENSIONS)],
      },
      { name: "Video", extensions: extensionList(VIDEO_EXTENSIONS) },
      { name: "Photos", extensions: extensionList(IMAGE_EXTENSIONS) },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const filePath = result.filePaths[0];
  const type = classifyMediaFile(filePath);
  if (!type) {
    await dialog.showMessageBox(mainWindow, {
      type: "error",
      title: "Unsupported file",
      message: "Anon Editor currently accepts video and photo files only.",
    });
    return null;
  }

  return Object.freeze({
    name: path.basename(filePath),
    path: filePath,
    type,
    url: pathToFileURL(filePath).href,
  });
}

function createMenu() {
  return Menu.buildFromTemplate([
    {
      label: "File",
      submenu: [
        {
          label: "Add video or photo",
          accelerator: "CmdOrCtrl+O",
          click: () => mainWindow?.webContents.send("media:request-pick"),
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "resetZoom" },
        { role: "togglefullscreen" },
      ],
    },
  ]);
}

app.whenReady().then(() => {
  installOfflineBoundary();
  ipcMain.handle("media:pick", pickMedia);
  Menu.setApplicationMenu(createMenu());
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
