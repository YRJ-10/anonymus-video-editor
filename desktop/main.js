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
  shell,
} = require("electron");
const {
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  classifyMediaFile,
  displayDimensions,
  shouldBlockRequest,
} = require("./media-policy");
const { probeFile } = require("../src/probe");
const {
  parseProject,
  serializeProject,
} = require("./project-file");
const { exportProject } = require("../src/export-project");

const smokeTest = process.argv.includes("--smoke-test");

app.commandLine.appendSwitch("disable-background-networking");
app.commandLine.appendSwitch("disable-component-update");
app.commandLine.appendSwitch("disable-domain-reliability");
app.commandLine.appendSwitch("disable-sync");
if (smokeTest) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu");
  const smokeUserData = path.join(process.cwd(), ".tmp-electron-smoke");
  fs.mkdirSync(smokeUserData, { recursive: true });
  app.setPath("userData", smokeUserData);
}
app.setName("Anon Editor");
if (process.platform === "win32") app.setAppUserModelId("com.yrj.anoneditor");

let mainWindow;
let currentProjectPath = null;

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
    icon: path.join(__dirname, "..", "appicon.png"),
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
            hasPhase7Ui: Boolean(
              document.querySelector("#canvas-landscape") &&
              document.querySelector("#canvas-portrait") &&
              document.querySelector("#transform-box") &&
              document.querySelector("#crop-dialog")
            ),
            hasPhase8Ui: Boolean(
              document.querySelector(".media-actions #add-media") &&
              document.querySelector(".media-actions #add-to-timeline") &&
              document.querySelector(".topbar > #export-video") &&
              document.querySelector(".timeline-title > .transform-controls") &&
              document.querySelector(".timeline-edit-actions #undo") &&
              document.querySelector("#timeline-resizer")
            ),
            hasPhase9Ui: Boolean(
              document.querySelector(".top-actions > .canvas-switch") &&
              document.querySelector(".text-controls #add-text") &&
              document.querySelector(".text-controls #edit-text") &&
              document.querySelector("#preview-fullscreen") &&
              typeof window.TimelineModel?.snapTime === "function"
            ),
            hasPhase10Ui: Boolean(
              document.querySelector(".audio-controls > .text-controls") &&
              document.querySelector("#detach-audio") &&
              document.querySelector("#audio-volume") &&
              document.querySelector("#mute-audio") &&
              document.querySelector("#reset-audio") &&
              typeof window.TimelineModel?.createAudioClip === "function" &&
              typeof window.TimelineModel?.updateAudioClip === "function"
            ),
            hasAppIcon: Boolean(
              document.querySelector('img.brand-mark[src$="appicon.png"]') &&
              document.querySelector('img.preview-empty-mark[src$="appicon.png"]') &&
              document.querySelector('img.export-mark[src$="appicon.png"]')
            ),
            hasExportQualityUi: Boolean(
              document.querySelector("#new-project") &&
              document.querySelector("#export-quality") &&
              document.querySelector("#start-export") &&
              document.querySelector("#show-export-folder") &&
              document.querySelector("#open-export-file")
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
    properties: ["openFile", "multiSelections"],
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

  const supportedPaths = result.filePaths.filter((filePath) => classifyMediaFile(filePath));
  if (supportedPaths.length === 0) {
    await dialog.showMessageBox(mainWindow, {
      type: "error",
      title: "Unsupported file",
      message: "Anon Editor currently accepts video and photo files only.",
    });
    return [];
  }

  const media = await Promise.all(
    supportedPaths.map(async (filePath) => {
      const type = classifyMediaFile(filePath);
      let dimensions = { width: 0, height: 0 };
      let hasAudio = false;
      try {
        const probe = await probeFile(filePath);
        const visualStream = (probe.streams || []).find(
          (stream) => stream.codec_type === "video",
        );
        dimensions = displayDimensions(visualStream);
        hasAudio = (probe.streams || []).some((stream) => stream.codec_type === "audio");
      } catch {
        // The renderer can still load each selected file and inspect it locally.
      }
      return Object.freeze({
        name: path.basename(filePath),
        path: filePath,
        type,
        url: pathToFileURL(filePath).href,
        width: dimensions.width || null,
        height: dimensions.height || null,
        hasAudio,
      });
    }),
  );
  return Object.freeze(media);
}

function newProject() {
  currentProjectPath = null;
  return true;
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
  project.assets = await Promise.all(project.assets.map(async (asset) => {
    const missing = !fs.existsSync(asset.path);
    if (missing) missingPaths.push(asset.path);
    let hasAudio = asset.hasAudio;
    if (!missing && asset.type === "video") {
      try {
        const probe = await probeFile(asset.path);
        hasAudio = (probe.streams || []).some((stream) => stream.codec_type === "audio");
      } catch {
        // Preserve the saved value if the source cannot be probed.
      }
    }
    return {
      ...asset,
      hasAudio,
      missing,
      url: pathToFileURL(asset.path).href,
    };
  }));
  currentProjectPath = source;
  return {
    project,
    missingPaths,
    path: source,
    name: path.basename(source),
  };
}

function defaultExportPath(project) {
  const firstAssetPath = project.assets?.find((asset) => asset?.path)?.path;
  const directory = firstAssetPath ? path.dirname(firstAssetPath) : app.getPath("videos");
  return path.join(directory, "anonymous-video.mp4");
}

async function exportVideo(_event, projectInput, options = {}) {
  const project = parseProject(serializeProject(projectInput));
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Export anonymous video",
    buttonLabel: "Export 1080p",
    defaultPath: defaultExportPath(project),
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
    quality: options.quality,
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
    quality: exported.quality,
    verification: exported.verification.summary,
  };
}

function showOutputInFolder(_event, filePath) {
  if (typeof filePath === "string" && fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
    return true;
  }
  return false;
}

async function openOutputFile(_event, filePath) {
  if (typeof filePath !== "string" || !fs.existsSync(filePath)) {
    return "Output file does not exist";
  }
  return shell.openPath(filePath);
}

function createMenu() {
  return Menu.buildFromTemplate([
    {
      label: "File",
      submenu: [
        {
          label: "New project",
          accelerator: "CmdOrCtrl+N",
          click: () => mainWindow?.webContents.send("project:request-new"),
        },
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
  ipcMain.handle("project:new", newProject);
  ipcMain.handle("project:save", saveProject);
  ipcMain.handle("project:open", openProject);
  ipcMain.handle("export:video", exportVideo);
  ipcMain.handle("output:show-in-folder", showOutputInFolder);
  ipcMain.handle("output:open-file", openOutputFile);
  Menu.setApplicationMenu(createMenu());
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
