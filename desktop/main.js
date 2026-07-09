"use strict";

const path = require("node:path");
const fs = require("node:fs");
const fsPromises = require("node:fs/promises");
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
const {
  parseProject,
  serializeProject,
} = require("./project-file");
const { exportProject } = require("../src/export-project");

app.commandLine.appendSwitch("disable-background-networking");
app.commandLine.appendSwitch("disable-component-update");
app.commandLine.appendSwitch("disable-domain-reliability");
app.commandLine.appendSwitch("disable-sync");

let mainWindow;
let currentProjectPath = null;
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
            hasPhase5Ui: Boolean(
              typeof window.anonEditor?.saveProject === "function" &&
              typeof window.EditorHistory?.undo === "function" &&
              document.querySelector("#undo") &&
              document.querySelector("#save-project")
            ),
            hasPhase6Ui: Boolean(
              typeof window.anonEditor?.exportVideo === "function" &&
              document.querySelector("#export-video") &&
              document.querySelector("#export-dialog")
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

async function saveProject(_event, project) {
  const serialized = serializeProject(project);
  let destination = currentProjectPath;

  if (!destination) {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Save Anon Editor project",
      buttonLabel: "Save project",
      defaultPath: "anon-project.anonproj",
      filters: [{ name: "Anon Editor Project", extensions: ["anonproj"] }],
    });
    if (result.canceled || !result.filePath) return null;
    destination = result.filePath.endsWith(".anonproj")
      ? result.filePath
      : `${result.filePath}.anonproj`;
  }

  await fsPromises.writeFile(destination, serialized, "utf8");
  currentProjectPath = destination;
  return {
    path: destination,
    name: path.basename(destination),
  };
}

async function openProject() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Open Anon Editor project",
    buttonLabel: "Open project",
    properties: ["openFile"],
    filters: [{ name: "Anon Editor Project", extensions: ["anonproj"] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const source = result.filePaths[0];
  const project = parseProject(await fsPromises.readFile(source, "utf8"));
  const missingPaths = [];
  project.assets = project.assets.map((asset) => {
    const missing = !fs.existsSync(asset.path);
    if (missing) missingPaths.push(asset.path);
    return {
      ...asset,
      missing,
      url: pathToFileURL(asset.path).href,
    };
  });
  currentProjectPath = source;
  return {
    project,
    missingPaths,
    path: source,
    name: path.basename(source),
  };
}

async function exportVideo(_event, projectInput) {
  const project = parseProject(serializeProject(projectInput));
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Export anonymous video",
    buttonLabel: "Export 1080p",
    defaultPath: "anonymous-video.mp4",
    filters: [{ name: "MP4 Video", extensions: ["mp4"] }],
  });
  if (result.canceled || !result.filePath) return null;
  const destination = result.filePath.endsWith(".mp4")
    ? result.filePath
    : `${result.filePath}.mp4`;

  mainWindow.webContents.send("export:progress", {
    progress: 0,
    stage: "Rendering timeline",
  });
  const exported = await exportProject(project, destination, {
    force: true,
    onProgress: (progress) => {
      mainWindow.webContents.send("export:progress", {
        progress,
        stage: progress >= 1 ? "Verifying anonymous output" : "Rendering timeline",
      });
    },
  });
  mainWindow.webContents.send("export:progress", {
    progress: 1,
    stage: "Export verified",
  });
  return {
    output: exported.output,
    duration: exported.duration,
    verification: exported.verification.summary,
  };
}

function createMenu() {
  return Menu.buildFromTemplate([
    {
      label: "File",
      submenu: [
        {
          label: "Open project",
          accelerator: "CmdOrCtrl+Shift+O",
          click: () => mainWindow?.webContents.send("project:request-open"),
        },
        {
          label: "Save project",
          accelerator: "CmdOrCtrl+S",
          click: () => mainWindow?.webContents.send("project:request-save"),
        },
        {
          label: "Export 1080p",
          accelerator: "CmdOrCtrl+E",
          click: () => mainWindow?.webContents.send("export:request"),
        },
        { type: "separator" },
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
  ipcMain.handle("project:save", saveProject);
  ipcMain.handle("project:open", openProject);
  ipcMain.handle("export:video", exportVideo);
  Menu.setApplicationMenu(createMenu());
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
