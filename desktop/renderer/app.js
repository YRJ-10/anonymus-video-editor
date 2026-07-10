"use strict";

const Timeline = window.TimelineModel;
const History = window.EditorHistory;
const BLUR_EXPORT_SAFE_PADDING_PX = 8;

const elements = {
  newProject: document.querySelector("#new-project"),
  openProject: document.querySelector("#open-project"),
  saveProject: document.querySelector("#save-project"),
  undo: document.querySelector("#undo"),
  redo: document.querySelector("#redo"),
  copyClip: document.querySelector("#copy-clip"),
  pasteClip: document.querySelector("#paste-clip"),
  exportVideo: document.querySelector("#export-video"),
  projectName: document.querySelector("#project-name"),
  appStatus: document.querySelector("#app-status"),
  exportDialog: document.querySelector("#export-dialog"),
  exportTitle: document.querySelector("#export-title"),
  exportProgress: document.querySelector("#export-progress"),
  exportStage: document.querySelector("#export-stage"),
  exportQualityRow: document.querySelector("#export-quality-row"),
  exportQuality: document.querySelector("#export-quality"),
  exportVerification: document.querySelector("#export-verification"),
  exportActions: document.querySelector("#export-actions"),
  startExport: document.querySelector("#start-export"),
  cancelExport: document.querySelector("#cancel-export"),
  exportResultActions: document.querySelector("#export-result-actions"),
  showExportFolder: document.querySelector("#show-export-folder"),
  openExportFile: document.querySelector("#open-export-file"),
  closeExport: document.querySelector("#close-export"),
  canvasLandscape: document.querySelector("#canvas-landscape"),
  canvasPortrait: document.querySelector("#canvas-portrait"),
  transformFit: document.querySelector("#transform-fit"),
  transformFill: document.querySelector("#transform-fill"),
  transformCrop: document.querySelector("#transform-crop"),
  transformColor: document.querySelector("#transform-color"),
  transformReset: document.querySelector("#transform-reset"),
  transformBox: document.querySelector("#transform-box"),
  cropDialog: document.querySelector("#crop-dialog"),
  cropForm: document.querySelector("#crop-form"),
  cropLeft: document.querySelector("#crop-left"),
  cropRight: document.querySelector("#crop-right"),
  cropTop: document.querySelector("#crop-top"),
  cropBottom: document.querySelector("#crop-bottom"),
  closeCropDialog: document.querySelector("#close-crop-dialog"),
  cancelCrop: document.querySelector("#cancel-crop"),
  resetCrop: document.querySelector("#reset-crop"),
  colorDialog: document.querySelector("#color-dialog"),
  colorForm: document.querySelector("#color-form"),
  colorBrightness: document.querySelector("#color-brightness"),
  colorBrightnessValue: document.querySelector("#color-brightness-value"),
  colorContrast: document.querySelector("#color-contrast"),
  colorContrastValue: document.querySelector("#color-contrast-value"),
  colorSaturation: document.querySelector("#color-saturation"),
  colorSaturationValue: document.querySelector("#color-saturation-value"),
  colorWarmth: document.querySelector("#color-warmth"),
  colorWarmthValue: document.querySelector("#color-warmth-value"),
  closeColorDialog: document.querySelector("#close-color-dialog"),
  cancelColor: document.querySelector("#cancel-color"),
  resetColor: document.querySelector("#reset-color"),
  addMedia: document.querySelector("#add-media"),
  addToTimeline: document.querySelector("#add-to-timeline"),
  addText: document.querySelector("#add-text"),
  editText: document.querySelector("#edit-text"),
  addBlur: document.querySelector("#add-blur"),
  editBlur: document.querySelector("#edit-blur"),
  addTrack: document.querySelector("#add-track"),
  assetCount: document.querySelector("#asset-count"),
  assetList: document.querySelector("#asset-list"),
  emptyAssets: document.querySelector("#empty-assets"),
  selectedName: document.querySelector("#selected-name"),
  viewport: document.querySelector("#preview-viewport"),
  previewFullscreen: document.querySelector("#preview-fullscreen"),
  compositionSurface: document.querySelector("#composition-surface"),
  overlayStage: document.querySelector("#overlay-stage"),
  previewEmpty: document.querySelector("#preview-empty"),
  video: document.querySelector("#video-preview"),
  image: document.querySelector("#image-preview"),
  play: document.querySelector("#play-toggle"),
  seek: document.querySelector("#seek"),
  currentTime: document.querySelector("#current-time"),
  duration: document.querySelector("#duration"),
  detachAudio: document.querySelector("#detach-audio"),
  muteAudio: document.querySelector("#mute-audio"),
  audioVolume: document.querySelector("#audio-volume"),
  audioVolumeValue: document.querySelector("#audio-volume-value"),
  resetAudio: document.querySelector("#reset-audio"),
  zoomOut: document.querySelector("#zoom-out"),
  zoomFit: document.querySelector("#zoom-fit"),
  zoomIn: document.querySelector("#zoom-in"),
  zoomValue: document.querySelector("#zoom-value"),
  splitClip: document.querySelector("#split-clip"),
  deleteClip: document.querySelector("#delete-clip"),
  timelineZoom: document.querySelector("#timeline-zoom"),
  timelineTimecode: document.querySelector("#timeline-timecode"),
  editorArea: document.querySelector(".editor-area"),
  timelineResizer: document.querySelector("#timeline-resizer"),
  timelineScroll: document.querySelector("#timeline-scroll"),
  timelineContent: document.querySelector("#timeline-content"),
  timelineRuler: document.querySelector("#timeline-ruler"),
  trackLabelList: document.querySelector("#track-label-list"),
  trackLanes: document.querySelector("#track-lanes"),
  playhead: document.querySelector("#playhead"),
  textDialog: document.querySelector("#text-dialog"),
  textForm: document.querySelector("#text-form"),
  textDialogTitle: document.querySelector("#text-dialog-title"),
  textValue: document.querySelector("#text-value"),
  textDuration: document.querySelector("#text-duration"),
  textSize: document.querySelector("#text-size"),
  textColor: document.querySelector("#text-color"),
  closeTextDialog: document.querySelector("#close-text-dialog"),
  cancelText: document.querySelector("#cancel-text"),
  blurDialog: document.querySelector("#blur-dialog"),
  blurForm: document.querySelector("#blur-form"),
  blurDialogTitle: document.querySelector("#blur-dialog-title"),
  blurDuration: document.querySelector("#blur-duration"),
  blurStrength: document.querySelector("#blur-strength"),
  blurStrengthValue: document.querySelector("#blur-strength-value"),
  blurWidth: document.querySelector("#blur-width"),
  blurHeight: document.querySelector("#blur-height"),
  blurKeyframesStatus: document.querySelector("#blur-keyframes-status"),
  clearBlurKeyframes: document.querySelector("#clear-blur-keyframes"),
  closeBlurDialog: document.querySelector("#close-blur-dialog"),
  cancelBlur: document.querySelector("#cancel-blur"),
  resetBlur: document.querySelector("#reset-blur"),
};

const state = {
  assets: [],
  selectedPath: null,
  loadedAssetPath: null,
  pendingVideoSeek: null,
  zoom: 1,
  panX: 0,
  panY: 0,
  draggingPreview: false,
  pointerX: 0,
  pointerY: 0,
  clips: [],
  tracks: [{ id: "v1", name: "V1", kind: "video" }],
  activeTrackId: "v1",
  selectedClipId: null,
  playhead: 0,
  pixelsPerSecond: 90,
  timelineDrag: null,
  timelineResizeDrag: null,
  timelineSnapEnabled: true,
  timelinePreview: false,
  baseClipId: null,
  compositionSignature: "",
  textDialogMode: "add",
  textDrag: null,
  blurDialogMode: "add",
  blurOriginal: null,
  blurAddedTrackId: null,
  blurDrag: null,
  history: null,
  clipboard: null,
  statusTimer: null,
  exportInProgress: false,
  lastExportPath: null,
  canvas: null,
  mediaTransformDrag: null,
  cropOriginal: null,
  colorOriginal: null,
};

function activeMediaElement() {
  if (elements.video.classList.contains("visible")) return elements.video;
  if (elements.image.classList.contains("visible")) return elements.image;
  return null;
}

function selectedAsset() {
  return state.assets.find((asset) => asset.path === state.selectedPath) || null;
}

function selectedClip() {
  return state.clips.find((clip) => clip.id === state.selectedClipId) || null;
}

function assetForClip(clip) {
  return state.assets.find((asset) => asset.path === clip?.assetPath) || null;
}

function trackOrder(trackId) {
  return state.tracks.findIndex((track) => track.id === trackId);
}

function trackKind(trackId) {
  const track = state.tracks.find((candidate) => candidate.id === trackId);
  return track?.kind === "audio" || trackId?.toLowerCase().startsWith("a")
    ? "audio"
    : "video";
}

function trackNumber(trackId) {
  const match = String(trackId || "").match(/\d+$/);
  return match ? Number(match[0]) : 0;
}

function hasClipsOnTrack(trackId) {
  return state.clips.some((clip) => clip.trackId === trackId);
}

function canDeleteTrack(track) {
  return Boolean(track) && track.id !== "v1" && !hasClipsOnTrack(track.id);
}

function ensureAudioTrack() {
  let track = state.tracks.find((candidate) => trackKind(candidate.id) === "audio");
  if (track) return track;
  const number =
    state.tracks.filter((candidate) => trackKind(candidate.id) === "audio").length + 1;
  track = { id: `a${number}`, name: `A${number}`, kind: "audio" };
  state.tracks.push(track);
  return track;
}

function targetVideoTrack() {
  const active = state.tracks.find(
    (track) => track.id === state.activeTrackId && trackKind(track.id) === "video",
  );
  return active || state.tracks.find((track) => trackKind(track.id) === "video") || null;
}

function clipsAtPlayhead() {
  return Timeline.findClipsAt(state.clips, state.playhead).sort(
    (a, b) => trackOrder(a.trackId) - trackOrder(b.trackId),
  );
}

function topClipAtPlayhead() {
  return clipsAtPlayhead().filter((clip) => ["video", "image"].includes(clip.type)).at(-1) || null;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function currentCanvas() {
  return (
    state.canvas || {
      orientation: "landscape",
      width: 1920,
      height: 1080,
      aspectRatio: "16:9",
    }
  );
}

function updateCanvasSurface() {
  const canvas = currentCanvas();
  const availableWidth = Math.max(1, elements.viewport.clientWidth - 48);
  const availableHeight = Math.max(1, elements.viewport.clientHeight - 38);
  const ratio = canvas.width / canvas.height;
  let width = availableWidth;
  let height = width / ratio;
  if (height > availableHeight) {
    height = availableHeight;
    width = height * ratio;
  }
  elements.compositionSurface.style.width = `${Math.round(width)}px`;
  elements.compositionSurface.style.height = `${Math.round(height)}px`;
  elements.canvasLandscape.classList.toggle(
    "active",
    canvas.orientation === "landscape",
  );
  elements.canvasPortrait.classList.toggle("active", canvas.orientation === "portrait");
  renderTransformBox();
}

function setCanvas(orientation, options = {}) {
  const portrait = orientation === "portrait";
  state.canvas = portrait
    ? { orientation: "portrait", width: 1080, height: 1920, aspectRatio: "9:16" }
    : { orientation: "landscape", width: 1920, height: 1080, aspectRatio: "16:9" };
  updateCanvasSurface();
  if (state.timelinePreview) renderComposition();
  if (options.record !== false) commitEdit();
  if (options.detected) {
    showStatus(
      `Canvas detected: ${portrait ? "Portrait 9:16" : "Landscape 16:9"}`,
    );
  }
}

function detectCanvasFromAsset(asset, record = true) {
  if (state.canvas || !asset?.width || !asset?.height) return false;
  setCanvas(asset.height > asset.width ? "portrait" : "landscape", {
    record,
    detected: true,
  });
  return true;
}

function captureEditingState() {
  return {
    assets: structuredClone(state.assets),
    tracks: structuredClone(state.tracks),
    clips: structuredClone(state.clips),
    activeTrackId: state.activeTrackId,
    selectedPath: state.selectedPath,
    selectedClipId: state.selectedClipId,
    playhead: state.playhead,
    pixelsPerSecond: state.pixelsPerSecond,
    timelinePreview: state.timelinePreview,
    canvas: structuredClone(state.canvas),
  };
}

function updateEditControls() {
  elements.undo.disabled = !state.history || !History.canUndo(state.history);
  elements.redo.disabled = !state.history || !History.canRedo(state.history);
  elements.copyClip.disabled = !selectedClip();
  elements.pasteClip.disabled = !state.clipboard;
  elements.exportVideo.disabled = state.clips.length === 0 || state.exportInProgress;
}

function commitEdit() {
  if (!state.history) {
    state.history = History.create(captureEditingState());
  } else {
    state.history = History.commit(state.history, captureEditingState());
  }
  updateEditControls();
}

function restoreEditingState(snapshot) {
  elements.video.pause();
  pauseOverlayVideos();
  state.assets = structuredClone(snapshot.assets);
  state.tracks = structuredClone(snapshot.tracks);
  state.clips = structuredClone(snapshot.clips);
  state.activeTrackId = snapshot.activeTrackId;
  state.selectedPath = snapshot.selectedPath;
  state.selectedClipId = snapshot.selectedClipId;
  state.playhead = snapshot.playhead;
  state.pixelsPerSecond = snapshot.pixelsPerSecond;
  state.timelinePreview = snapshot.timelinePreview;
  state.canvas = structuredClone(snapshot.canvas);
  state.loadedAssetPath = null;
  state.baseClipId = null;
  state.compositionSignature = "";
  state.pendingVideoSeek = null;
  state.blurOriginal = null;
  state.blurAddedTrackId = null;
  state.blurDrag = null;
  state.colorOriginal = null;
  elements.video.removeAttribute("src");
  elements.image.removeAttribute("src");
  elements.video.classList.remove("visible");
  elements.image.classList.remove("visible");
  elements.overlayStage.replaceChildren();
  elements.timelineZoom.value = String(state.pixelsPerSecond);
  updateCanvasSurface();

  renderAssets();
  renderTimeline();
  if (state.timelinePreview) {
    renderComposition();
  } else {
    const asset = selectedAsset();
    if (asset && !asset.missing) selectAsset(asset, { keepView: true });
    else {
      elements.previewEmpty.classList.remove("hidden");
      elements.selectedName.textContent = "Nothing selected";
      elements.play.disabled = true;
      elements.seek.disabled = true;
    }
  }
  updateEditControls();
}

function undoEdit() {
  if (!state.history) return;
  const next = History.undo(state.history);
  if (next === state.history) return;
  state.history = next;
  restoreEditingState(state.history.present);
}

function redoEdit() {
  if (!state.history) return;
  const next = History.redo(state.history);
  if (next === state.history) return;
  state.history = next;
  restoreEditingState(state.history.present);
}

function showStatus(message, error = false) {
  clearTimeout(state.statusTimer);
  elements.appStatus.textContent = message;
  elements.appStatus.classList.toggle("error", error);
  elements.appStatus.classList.add("visible");
  state.statusTimer = setTimeout(() => {
    elements.appStatus.classList.remove("visible");
  }, 3200);
}

function projectPayload() {
  const canvas = currentCanvas();
  return {
    format: "anon-editor-project",
    version: 1,
    assets: state.assets.map(({ path, name, type, duration, width, height, hasAudio }) => ({
      path,
      name,
      type,
      duration,
      width,
      height,
      hasAudio,
    })),
    tracks: structuredClone(state.tracks),
    clips: structuredClone(state.clips),
    activeTrackId: state.activeTrackId,
    playhead: state.playhead,
    pixelsPerSecond: state.pixelsPerSecond,
    canvas,
  };
}

async function saveProject() {
  try {
    const result = await window.anonEditor.saveProject(projectPayload());
    if (!result) return;
    elements.projectName.textContent = result.name;
    showStatus(`Project saved: ${result.name}`);
  } catch (error) {
    showStatus(`Could not save project: ${error.message}`, true);
  }
}

async function openProject() {
  try {
    const result = await window.anonEditor.openProject();
    if (!result) return;
    const project = result.project;
    state.assets = project.assets;
    state.tracks = project.tracks;
    state.clips = project.clips;
    state.activeTrackId = project.activeTrackId;
    state.playhead = project.playhead;
    state.pixelsPerSecond = project.pixelsPerSecond;
    state.canvas = project.canvas;
    state.selectedPath = project.assets[0]?.path || null;
    state.selectedClipId = null;
    state.timelinePreview = project.clips.length > 0;
    state.loadedAssetPath = null;
    state.baseClipId = null;
    state.compositionSignature = "";
    state.pendingVideoSeek = null;
    elements.timelineZoom.value = String(state.pixelsPerSecond);
    elements.projectName.textContent = result.name;
    state.history = History.create(captureEditingState());
    restoreEditingState(state.history.present);
    const missing = result.missingPaths.length;
    showStatus(
      missing
        ? `Project opened with ${missing} missing media file${missing === 1 ? "" : "s"}`
        : `Project opened: ${result.name}`,
      missing > 0,
    );
  } catch (error) {
    showStatus(`Could not open project: ${error.message}`, true);
  }
}

async function newProject() {
  if (
    (state.assets.length > 0 || state.clips.length > 0) &&
    !confirm("Discard the current project and start a new one?")
  ) {
    return;
  }
  try {
    await window.anonEditor.newProject();
  } catch {
    // Local reset still works if the main process cannot clear its project path.
  }
  elements.video.pause();
  pauseOverlayVideos();
  state.assets = [];
  state.selectedPath = null;
  state.loadedAssetPath = null;
  state.pendingVideoSeek = null;
  state.zoom = 1;
  state.panX = 0;
  state.panY = 0;
  state.clips = [];
  state.tracks = [{ id: "v1", name: "V1", kind: "video" }];
  state.activeTrackId = "v1";
  state.selectedClipId = null;
  state.playhead = 0;
  state.pixelsPerSecond = 90;
  state.timelineSnapEnabled = true;
  state.timelinePreview = false;
  state.baseClipId = null;
  state.compositionSignature = "";
  state.blurOriginal = null;
  state.blurAddedTrackId = null;
  state.blurDrag = null;
  state.colorOriginal = null;
  state.clipboard = null;
  state.exportInProgress = false;
  state.lastExportPath = null;
  state.canvas = null;
  elements.projectName.textContent = "Untitled project";
  elements.timelineZoom.value = String(state.pixelsPerSecond);
  elements.video.removeAttribute("src");
  elements.image.removeAttribute("src");
  elements.video.classList.remove("visible");
  elements.image.classList.remove("visible");
  elements.overlayStage.replaceChildren();
  elements.previewEmpty.classList.remove("hidden");
  elements.selectedName.textContent = "Nothing selected";
  elements.play.disabled = true;
  elements.seek.disabled = true;
  elements.seek.value = "0";
  elements.currentTime.textContent = "00:00";
  elements.duration.textContent = "00:00";
  resetView();
  updateCanvasSurface();
  renderAssets();
  renderTimeline();
  state.history = History.create(captureEditingState());
  updateEditControls();
  showStatus("New project ready");
}

function prepareExportDialog() {
  if (state.exportInProgress || state.clips.length === 0) return;
  state.lastExportPath = null;
  elements.exportTitle.textContent = "Export anonymous MP4";
  elements.exportProgress.value = 0;
  elements.exportProgress.hidden = false;
  elements.exportStage.textContent =
    "Choose compression. Output stays MP4 and must pass privacy verification.";
  elements.exportQualityRow.hidden = false;
  elements.exportVerification.textContent = "";
  elements.exportVerification.classList.remove("error", "verified");
  elements.exportActions.hidden = false;
  elements.exportResultActions.hidden = true;
  elements.showExportFolder.hidden = false;
  elements.openExportFile.hidden = false;
  elements.startExport.disabled = false;
  elements.cancelExport.disabled = false;
  if (!elements.exportDialog.open) elements.exportDialog.showModal();
}

async function exportTimeline() {
  if (state.exportInProgress || state.clips.length === 0) return;
  state.exportInProgress = true;
  updateEditControls();
  elements.exportTitle.textContent = "Rendering 1080p video";
  elements.exportProgress.hidden = false;
  elements.exportProgress.value = 0;
  elements.exportStage.textContent = "Choose the output file…";
  elements.exportVerification.textContent = "";
  elements.exportVerification.classList.remove("error", "verified");
  elements.exportQualityRow.hidden = true;
  elements.exportActions.hidden = true;
  elements.exportResultActions.hidden = true;
  if (!elements.exportDialog.open) elements.exportDialog.showModal();

  try {
    const result = await window.anonEditor.exportVideo(projectPayload(), {
      quality: elements.exportQuality.value,
    });
    if (!result) {
      elements.exportDialog.close();
      return;
    }
    state.lastExportPath = result.output;
    elements.exportProgress.value = 1;
    elements.exportTitle.textContent = "Anonymous export complete";
    elements.exportStage.textContent = result.output;
    elements.exportVerification.classList.add("verified");
    elements.exportVerification.innerHTML = `
      <span class="verification-pill">Source metadata <strong>0</strong></span>
      <span class="verification-pill">Chapters <strong>0</strong></span>
      <span class="verification-pill privacy-pass">Privacy verification passed</span>
      <span class="verification-preset">Preset: ${result.quality || elements.exportQuality.value}</span>
    `;
    elements.exportResultActions.hidden = false;
    elements.showExportFolder.hidden = false;
    elements.openExportFile.hidden = false;
    showStatus("1080p export completed and verified");
  } catch (error) {
    elements.exportTitle.textContent = "Export blocked";
    elements.exportStage.textContent = "No output file was published.";
    elements.exportVerification.textContent = error.message;
    elements.exportVerification.classList.add("error");
    elements.exportVerification.classList.remove("verified");
    elements.exportResultActions.hidden = false;
    elements.showExportFolder.hidden = true;
    elements.openExportFile.hidden = true;
  } finally {
    state.exportInProgress = false;
    updateEditControls();
  }
}

function copySelectedClip() {
  const clip = selectedClip();
  if (!clip) return;
  state.clipboard = structuredClone(clip);
  updateEditControls();
  showStatus("Clip copied");
}

function pasteClipboardClip() {
  if (!state.clipboard) return;
  if (
    !["text", "blur"].includes(state.clipboard.type) &&
    !state.assets.some((asset) => asset.path === state.clipboard.assetPath)
  ) {
    showStatus("The copied clip's media is not available", true);
    return;
  }

  const destination =
    state.clipboard.type === "audio" ? ensureAudioTrack() : targetVideoTrack();
  if (!destination) return;
  const clip = {
    ...structuredClone(state.clipboard),
    id: crypto.randomUUID(),
    trackId: destination.id,
    start: state.playhead,
  };
  state.clips = [...state.clips, clip];
  state.selectedClipId = clip.id;
  state.timelinePreview = true;
  renderTimeline();
  renderComposition();
  commitEdit();
  showStatus(`Clip pasted to ${state.activeTrackId.toUpperCase()}`);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function formatTimelineTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00.00";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${remainder.toFixed(2).padStart(5, "0")}`;
}

function applyTransform() {
  elements.compositionSurface.style.transform =
    `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  elements.zoomValue.textContent = `${Math.round(state.zoom * 100)}%`;
}

function mediaFramePercent(clip) {
  const canvas = currentCanvas();
  const asset = assetForClip(clip);
  const transform = Timeline.normalizeTransform(clip.transform, clip.trackId);
  if (transform.fitMode === "fill" || !asset?.width || !asset?.height) {
    return { width: 100, height: 100 };
  }

  const assetRatio = asset.width / asset.height;
  const canvasRatio = canvas.width / canvas.height;
  if (assetRatio >= canvasRatio) {
    return { width: 100, height: (100 * canvasRatio) / assetRatio };
  }
  return { width: (100 * assetRatio) / canvasRatio, height: 100 };
}

function colorCssFilter(clip) {
  const color = Timeline.normalizeColorAdjustment(clip?.colorAdjustment);
  const brightness = Math.max(0, 100 + color.brightness);
  const contrast = Math.max(0, color.contrast);
  const saturation = Math.max(0, color.saturation);
  const warmth = color.warmth / 100;
  const sepia = Math.max(0, warmth) * 0.32;
  const hue = warmth < 0 ? Math.abs(warmth) * 10 : -warmth * 8;
  return (
    `brightness(${brightness}%) contrast(${contrast}%) ` +
    `saturate(${saturation}%) sepia(${sepia}) hue-rotate(${hue}deg)`
  );
}

function applyMediaClipStyle(element, clip) {
  const transform = Timeline.normalizeTransform(clip.transform, clip.trackId);
  const frame = mediaFramePercent(clip);
  element.classList.add("timeline-layer");
  element.style.inset = "auto";
  element.style.left = `${transform.x}%`;
  element.style.top = `${transform.y}%`;
  element.style.width = `${frame.width}%`;
  element.style.height = `${frame.height}%`;
  element.style.maxWidth = "none";
  element.style.maxHeight = "none";
  element.style.objectFit = transform.fitMode === "fill" ? "cover" : "fill";
  element.style.transform = `translate(-50%, -50%) scale(${transform.scale})`;
  element.style.clipPath =
    `inset(${transform.crop.top * 100}% ${transform.crop.right * 100}% ` +
    `${transform.crop.bottom * 100}% ${transform.crop.left * 100}%)`;
  element.style.filter = colorCssFilter(clip);
}

function resetMediaClipStyle(element) {
  element.classList.remove("timeline-layer");
  for (const property of [
    "inset",
    "left",
    "top",
    "width",
    "height",
    "maxWidth",
    "maxHeight",
    "objectFit",
    "transform",
    "clipPath",
    "filter",
  ]) {
    element.style[property] = "";
  }
}

function selectedMediaClip() {
  const clip = selectedClip();
  return clip && ["video", "image"].includes(clip.type) ? clip : null;
}

function selectedBlurClip() {
  const clip = selectedClip();
  return clip?.type === "blur" ? clip : null;
}

function blurTrackingCount(clip) {
  return Array.isArray(clip?.keyframes) ? clip.keyframes.length : 0;
}

function blurHasTracking(clip) {
  return blurTrackingCount(clip) > 0;
}

function updateTransformControls() {
  const clip = selectedMediaClip();
  const enabled =
    Boolean(clip) &&
    state.timelinePreview &&
    state.playhead >= clip.start &&
    state.playhead < Timeline.clipEnd(clip);
  for (const button of [
    elements.transformFit,
    elements.transformFill,
    elements.transformCrop,
    elements.transformColor,
    elements.transformReset,
  ]) {
    button.disabled = !enabled;
  }
  const mode = clip
    ? Timeline.normalizeTransform(clip.transform, clip.trackId).fitMode
    : null;
  elements.transformFit.classList.toggle("active", enabled && mode === "fit");
  elements.transformFill.classList.toggle("active", enabled && mode === "fill");
}

function renderTransformBox() {
  const clip = selectedMediaClip();
  const active =
    clip &&
    state.timelinePreview &&
    state.playhead >= clip.start &&
    state.playhead < Timeline.clipEnd(clip);
  elements.transformBox.classList.toggle("visible", Boolean(active));
  updateTransformControls();
  if (!active) return;

  const transform = Timeline.normalizeTransform(clip.transform, clip.trackId);
  const frame = mediaFramePercent(clip);
  const visibleWidth =
    frame.width * transform.scale * (1 - transform.crop.left - transform.crop.right);
  const visibleHeight =
    frame.height * transform.scale * (1 - transform.crop.top - transform.crop.bottom);
  const centerX =
    transform.x +
    ((transform.crop.left - transform.crop.right) * frame.width * transform.scale) / 2;
  const centerY =
    transform.y +
    ((transform.crop.top - transform.crop.bottom) * frame.height * transform.scale) / 2;
  elements.transformBox.style.left = `${centerX}%`;
  elements.transformBox.style.top = `${centerY}%`;
  elements.transformBox.style.width = `${Math.max(0.5, visibleWidth)}%`;
  elements.transformBox.style.height = `${Math.max(0.5, visibleHeight)}%`;
}

function resetView() {
  state.zoom = 1;
  state.panX = 0;
  state.panY = 0;
  applyTransform();
}

function setZoom(nextZoom, anchor) {
  const oldZoom = state.zoom;
  const zoom = clamp(nextZoom, 0.25, 4);
  if (zoom === oldZoom) return;

  if (anchor) {
    const rect = elements.viewport.getBoundingClientRect();
    const relativeX = anchor.x - rect.left - rect.width / 2;
    const relativeY = anchor.y - rect.top - rect.height / 2;
    const mediaX = (relativeX - state.panX) / oldZoom;
    const mediaY = (relativeY - state.panY) / oldZoom;
    state.panX = relativeX - mediaX * zoom;
    state.panY = relativeY - mediaY * zoom;
  }

  state.zoom = zoom;
  applyTransform();
}

function updateAddToTimelineButton() {
  const asset = selectedAsset();
  const track = targetVideoTrack();
  elements.addToTimeline.disabled =
    !asset ||
    !Number.isFinite(asset.duration) ||
    !track;
  elements.addToTimeline.textContent = `＋ Add to ${track?.name || "timeline"}`;
}

function audioEditableClip() {
  const clip = selectedClip();
  if (!clip) return null;
  if (clip.type === "audio") return clip;
  const asset = assetForClip(clip);
  if (clip.type === "video" && asset?.hasAudio && !clip.audioDetached) return clip;
  return null;
}

function updateAudioControls() {
  const clip = audioEditableClip();
  const detachable = clip?.type === "video";
  elements.detachAudio.disabled = !detachable;
  elements.audioVolume.disabled = !clip;
  elements.muteAudio.disabled = !clip;
  elements.resetAudio.disabled = !clip;
  const volume = clip ? Math.round((clip.volume ?? 1) * 100) : 100;
  elements.audioVolume.value = String(volume);
  elements.audioVolumeValue.textContent = `${volume}%`;
  elements.muteAudio.classList.toggle("active", Boolean(clip?.muted));
  elements.muteAudio.textContent = clip?.muted ? "Unmute" : "Mute";
}

function detachSelectedAudio() {
  const clip = audioEditableClip();
  if (!clip || clip.type !== "video") return;
  const audioTrack = ensureAudioTrack();
  const audioClip = Timeline.createAudioClip({
    id: crypto.randomUUID(),
    videoClip: clip,
    trackId: audioTrack.id,
  });
  state.clips = state.clips.map((candidate) =>
    candidate.id === clip.id ? { ...candidate, audioDetached: true } : candidate,
  );
  state.clips.push(audioClip);
  state.selectedClipId = audioClip.id;
  state.activeTrackId = audioTrack.id;
  state.timelinePreview = true;
  renderTimeline();
  renderComposition();
  commitEdit();
  showStatus(`Audio detached to ${audioTrack.name}`);
}

function setSelectedAudio(changes, record = true) {
  const clip = audioEditableClip();
  if (!clip) return;
  state.clips = Timeline.updateAudioClip(state.clips, clip.id, changes);
  updateAudioControls();
  applyAudioPreviewLevels();
  if (record) commitEdit();
}

function applyAudioPreviewLevels() {
  const baseClip = state.clips.find((clip) => clip.id === state.baseClipId);
  if (baseClip?.type === "video") {
    elements.video.muted = Boolean(baseClip.audioDetached || baseClip.muted);
    elements.video.volume = clamp(baseClip.volume ?? 1, 0, 1);
  }
  for (const media of overlayVideos()) {
    const clip = state.clips.find((candidate) => candidate.id === media.dataset.clipId);
    if (!clip) continue;
    media.muted = Boolean(clip.audioDetached || clip.muted);
    media.volume = clamp(clip.volume ?? 1, 0, 1);
  }
}

function renderAssets() {
  elements.assetCount.textContent = String(state.assets.length);
  elements.emptyAssets.classList.toggle("hidden", state.assets.length > 0);
  elements.assetList.replaceChildren();

  for (const asset of state.assets) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "asset-card";
    button.classList.toggle("selected", asset.path === state.selectedPath);

    const icon = document.createElement("span");
    icon.className = "asset-type";
    icon.textContent = asset.type === "video" ? "VID" : "IMG";

    const copy = document.createElement("span");
    copy.className = "asset-copy";
    const name = document.createElement("strong");
    name.textContent = asset.name;
    const type = document.createElement("span");
    type.textContent =
      asset.missing
        ? "Missing file"
        : asset.type === "video"
        ? Number.isFinite(asset.duration)
          ? `${formatTime(asset.duration)} video`
          : "Loading video…"
        : "5 second photo";
    copy.append(name, type);

    button.append(icon, copy);
    button.addEventListener("click", () => {
      if (asset.missing) {
        showStatus(`Missing media: ${asset.path}`, true);
        return;
      }
      state.selectedClipId = null;
      state.timelinePreview = false;
      state.baseClipId = null;
      state.compositionSignature = "";
      elements.overlayStage.replaceChildren();
      selectAsset(asset);
      renderTimeline();
    });
    elements.assetList.append(button);
  }
}

function playbackElement() {
  if (elements.video.classList.contains("visible")) return elements.video;
  return elements.overlayStage.querySelector("audio.composition-audio");
}

function playbackClip(media = playbackElement()) {
  if (!media) return null;
  if (media === elements.video) {
    return state.timelinePreview
      ? state.clips.find((candidate) => candidate.id === state.baseClipId)
      : selectedClip();
  }
  return state.clips.find((candidate) => candidate.id === media.dataset.clipId) || null;
}

function updatePlayback(media = playbackElement()) {
  if (!media) return;
  elements.currentTime.textContent = formatTime(media.currentTime);
  elements.duration.textContent = formatTime(media.duration);
  elements.seek.value = String(media.currentTime || 0);
  elements.play.textContent = media.paused ? "▶" : "❚❚";
}

function applyPendingVideoSeek() {
  if (!Number.isFinite(state.pendingVideoSeek) || elements.video.readyState < 1) return;
  elements.video.currentTime = clamp(
    state.pendingVideoSeek,
    0,
    elements.video.duration || state.pendingVideoSeek,
  );
  state.pendingVideoSeek = null;
  updatePlayback();
}

function continueTimelinePlaybackAt(boundary) {
  if (!state.timelinePreview) return false;
  const nextClips = Timeline.findClipsAt(state.clips, boundary + 0.0001);
  const hasPlayableClip = nextClips.some((clip) =>
    ["video", "audio"].includes(clip.type),
  );
  if (!hasPlayableClip) return false;

  state.playhead = boundary;
  renderComposition();
  const media = playbackElement();
  if (!media) return false;

  const resume = async () => {
    try {
      await media.play();
    } catch (error) {
      showStatus(error.message || "Could not continue timeline playback", true);
    }
  };
  if (media.readyState >= 1) resume();
  else media.addEventListener("loadedmetadata", resume, { once: true });
  return true;
}

function selectAsset(asset, options = {}) {
  const {
    keepView = false,
    fromComposition = false,
    preserveSelection = false,
  } = options;
  const alreadyLoaded = state.loadedAssetPath === asset.path;

  if (!preserveSelection) {
    state.selectedPath = asset.path;
    elements.selectedName.textContent = asset.name;
  }
  elements.previewEmpty.classList.add("hidden");

  if (!alreadyLoaded) {
    elements.video.pause();
    elements.video.removeAttribute("src");
    elements.image.removeAttribute("src");
    elements.video.classList.remove("visible");
    elements.image.classList.remove("visible");

    if (asset.type === "video") {
      elements.video.src = asset.url;
      elements.video.classList.add("visible");
      elements.video.load();
      elements.play.disabled = false;
      elements.seek.disabled = false;
    } else {
      elements.image.src = asset.url;
      elements.image.classList.add("visible");
      elements.play.disabled = true;
      elements.seek.disabled = true;
      elements.seek.value = "0";
      elements.currentTime.textContent = "00:00";
      elements.duration.textContent = "PHOTO";
    }

    state.loadedAssetPath = asset.path;
  } else if (asset.type === "video") {
    elements.video.classList.add("visible");
    elements.image.classList.remove("visible");
    elements.play.disabled = false;
    elements.seek.disabled = false;
  } else {
    elements.image.classList.add("visible");
    elements.video.classList.remove("visible");
    elements.play.disabled = true;
    elements.seek.disabled = true;
  }

  if (!keepView) resetView();
  if (!fromComposition) {
    resetMediaClipStyle(elements.video);
    resetMediaClipStyle(elements.image);
    state.baseClipId = null;
    state.compositionSignature = "";
    elements.overlayStage.replaceChildren();
  }
  updateAddToTimelineButton();
  renderAssets();
  applyPendingVideoSeek();
}

async function addMedia() {
  elements.addMedia.disabled = true;
  try {
    const result = await window.anonEditor.pickMedia();
    const pickedItems = Array.isArray(result) ? result : result ? [result] : [];
    if (pickedItems.length === 0) return;

    let selected = null;
    let changed = false;
    let addedCount = 0;
    for (const picked of pickedItems) {
      let asset = state.assets.find((item) => item.path === picked.path);
      if (!asset) {
        asset = {
          ...picked,
          duration: picked.type === "image" ? 5 : null,
        };
        state.assets.push(asset);
        changed = true;
        addedCount += 1;
      } else {
        if (!asset.width && picked.width) {
          asset.width = picked.width;
          asset.height = picked.height;
          changed = true;
        }
        if (picked.hasAudio && !asset.hasAudio) {
          asset.hasAudio = true;
          changed = true;
        }
      }
      selected ||= asset;
    }

    const detectedCanvas = detectCanvasFromAsset(selected, false);
    state.selectedClipId = null;
    state.timelinePreview = false;
    selectAsset(selected);
    renderTimeline();
    if (changed || detectedCanvas) commitEdit();
    showStatus(
      addedCount > 0
        ? `${addedCount} media file${addedCount === 1 ? "" : "s"} added`
        : "Selected media already exists in this project",
    );
  } finally {
    elements.addMedia.disabled = false;
  }
}

function addSelectedAssetToTimeline() {
  const asset = selectedAsset();
  const track = targetVideoTrack();
  if (!asset || !Number.isFinite(asset.duration) || !track) return;

  const clip = Timeline.createClip({
    id: crypto.randomUUID(),
    asset,
    trackId: track.id,
  });
  state.clips = Timeline.appendClip(state.clips, clip);
  state.activeTrackId = track.id;
  state.selectedClipId = clip.id;
  state.timelinePreview = true;
  state.playhead = state.clips.find((candidate) => candidate.id === clip.id).start;
  renderTimeline();
  renderComposition();
  ensurePlayheadVisible();
  commitEdit();
}

function rulerStep() {
  if (state.pixelsPerSecond >= 180) return 0.5;
  if (state.pixelsPerSecond >= 90) return 1;
  if (state.pixelsPerSecond >= 55) return 2;
  if (state.pixelsPerSecond >= 20) return 5;
  if (state.pixelsPerSecond >= 8) return 10;
  return 30;
}

function updateTimelineControls() {
  const clip = selectedClip();
  const canSplit =
    clip &&
    state.playhead > clip.start + Timeline.MIN_CLIP_DURATION &&
    state.playhead < Timeline.clipEnd(clip) - Timeline.MIN_CLIP_DURATION;
  elements.splitClip.disabled = !canSplit;
  elements.deleteClip.disabled = !clip && !selectedAsset();
  elements.editText.disabled = clip?.type !== "text";
  elements.editBlur.disabled = clip?.type !== "blur";
  elements.timelineTimecode.textContent = formatTimelineTime(state.playhead);
  updateAudioControls();
  updateAddToTimelineButton();
  updateEditControls();
}

function updatePlayheadVisual() {
  elements.playhead.style.left = `${state.playhead * state.pixelsPerSecond}px`;
  updateTimelineControls();
}

function renderRuler(totalSeconds) {
  elements.timelineRuler.replaceChildren();
  const step = rulerStep();

  for (let time = 0; time <= totalSeconds + step / 2; time += step) {
    const tick = document.createElement("div");
    const rounded = Math.round(time * 1000) / 1000;
    const major = Math.abs(rounded - Math.round(rounded)) < 0.001;
    tick.className = `ruler-tick${major ? " major" : ""}`;
    tick.style.left = `${rounded * state.pixelsPerSecond}px`;

    if (major) {
      const label = document.createElement("span");
      label.textContent = formatTime(rounded);
      tick.append(label);
    }

    elements.timelineRuler.append(tick);
  }
}

function beginClipDrag(event, clipId, mode) {
  const clip = state.clips.find((candidate) => candidate.id === clipId);
  if (!clip || event.button !== 0) return;

  event.preventDefault();
  event.stopPropagation();
  state.selectedClipId = clipId;
  state.activeTrackId = clip.trackId;
  state.timelinePreview = true;
  state.timelineDrag = {
    mode,
    startX: event.clientX,
    clipId,
    baseClip: { ...clip },
    baseClips: state.clips.map((candidate) => ({ ...candidate })),
  };
  selectClipAtTime(clip, clamp(state.playhead, clip.start, Timeline.clipEnd(clip)));
  renderTimeline();
}

function addTrack(recordHistory = true) {
  const number =
    Math.max(
      1,
      ...state.tracks
        .filter((candidate) => trackKind(candidate.id) === "video")
        .map((candidate) => trackNumber(candidate.id)),
    ) + 1;
  const track = { id: `v${number}`, name: `V${number}`, kind: "video" };
  state.tracks.push(track);
  state.activeTrackId = track.id;
  renderTimeline();
  updateAddToTimelineButton();
  if (recordHistory) commitEdit();
  return track;
}

function deleteTrack(trackId) {
  const track = state.tracks.find((candidate) => candidate.id === trackId);
  if (!canDeleteTrack(track)) return;

  state.tracks = state.tracks.filter((candidate) => candidate.id !== trackId);
  if (state.activeTrackId === trackId) {
    state.activeTrackId =
      state.tracks.find((candidate) => trackKind(candidate.id) === "video")?.id ||
      state.tracks[0]?.id ||
      "v1";
  }
  renderTimeline();
  updateAddToTimelineButton();
  commitEdit();
}

function renderTrackStructure() {
  elements.trackLabelList.replaceChildren();
  elements.trackLanes.replaceChildren();

  const visualTracks = [
    ...state.tracks.filter((track) => trackKind(track.id) === "video").reverse(),
    ...state.tracks.filter((track) => trackKind(track.id) === "audio"),
  ];
  for (const track of visualTracks) {
    const label = document.createElement("div");
    label.className = "track-label";
    label.classList.toggle("active", track.id === state.activeTrackId);
    label.dataset.trackId = track.id;
    const emptyTrack = !hasClipsOnTrack(track.id);
    const name = document.createElement("strong");
    name.textContent = track.name;
    const type = document.createElement("span");
    type.textContent =
      trackKind(track.id) === "audio"
        ? "Audio"
        : track.id === "v1"
          ? "Base"
          : "Overlay";
    label.append(name, type);
    if (canDeleteTrack(track)) {
      const remove = document.createElement("button");
      remove.className = "track-delete";
      remove.type = "button";
      remove.title = `Delete empty ${track.name}`;
      remove.textContent = "×";
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteTrack(track.id);
      });
      label.append(remove);
    }
    label.addEventListener("click", () => {
      state.selectedClipId = null;
      state.activeTrackId = track.id;
      renderTimeline();
      updateAddToTimelineButton();
    });
    elements.trackLabelList.append(label);

    const lane = document.createElement("div");
    lane.className = `track-lane ${trackKind(track.id)}`;
    lane.classList.toggle("active", track.id === state.activeTrackId);
    lane.dataset.trackId = track.id;
    lane.style.backgroundSize = `${state.pixelsPerSecond}px 100%`;
    lane.addEventListener("pointerdown", (event) => {
      if (event.target !== lane || event.button !== 0) return;
      event.preventDefault();
      state.selectedClipId = null;
      state.activeTrackId = track.id;
      state.timelinePreview = true;
      state.timelineDrag = { mode: "playhead" };
      setPlayhead(timelineTimeFromPointer(event));
      renderTimeline();
    });

    if (emptyTrack) {
      const empty = document.createElement("div");
      empty.className = "timeline-empty";
      empty.textContent =
        track.id === state.activeTrackId
          ? `Add media or text to ${track.name}`
          : `${track.name} is empty`;
      lane.append(empty);
    }
    elements.trackLanes.append(lane);
  }
}

function renderClips() {
  for (const clip of state.clips) {
    const lane = elements.trackLanes.querySelector(`[data-track-id="${clip.trackId}"]`);
    if (!lane) continue;
    lane.querySelector(".timeline-empty")?.remove();

    const element = document.createElement("div");
    element.className = `timeline-clip ${clip.type}`;
    element.classList.toggle("selected", clip.id === state.selectedClipId);
    element.classList.toggle(
      "dragging",
      state.timelineDrag?.clipId === clip.id && state.timelineDrag.mode !== "playhead",
    );
    element.style.left = `${clip.start * state.pixelsPerSecond}px`;
    element.style.width = `${Math.max(9, Timeline.clipDuration(clip) * state.pixelsPerSecond)}px`;
    element.dataset.clipId = clip.id;
    element.title = `${clip.assetName} — ${formatTimelineTime(Timeline.clipDuration(clip))}`;

    const leftHandle = document.createElement("span");
    leftHandle.className = "clip-handle left";
    leftHandle.addEventListener("pointerdown", (event) =>
      beginClipDrag(event, clip.id, "trim-left"),
    );

    const body = document.createElement("span");
    body.className = "clip-body";
    const label = document.createElement("strong");
    label.textContent = clip.assetName;
    body.append(label);

    const rightHandle = document.createElement("span");
    rightHandle.className = "clip-handle right";
    rightHandle.addEventListener("pointerdown", (event) =>
      beginClipDrag(event, clip.id, "trim-right"),
    );

    element.append(leftHandle, body, rightHandle);
    element.addEventListener("pointerdown", (event) => {
      if (event.target.classList.contains("clip-handle")) return;
      beginClipDrag(event, clip.id, "move");
    });
    if (clip.type === "text") {
      element.addEventListener("dblclick", (event) => {
        event.stopPropagation();
        state.selectedClipId = clip.id;
        openTextDialog("edit");
      });
    } else if (clip.type === "blur") {
      element.addEventListener("dblclick", (event) => {
        event.stopPropagation();
        state.selectedClipId = clip.id;
        openBlurDialog("edit");
      });
    }
    lane.append(element);
  }
}

function renderTimeline() {
  const visibleWidth = elements.timelineScroll.clientWidth || 800;
  const end = Math.max(15, Timeline.timelineEnd(state.clips) + 5);
  const width = Math.max(visibleWidth, Math.ceil(end * state.pixelsPerSecond));
  const timelineHeight = 28 + state.tracks.length * 80;
  elements.timelineContent.style.width = `${width}px`;
  elements.timelineContent.style.height = `${timelineHeight}px`;
  elements.trackLanes.style.height = `${state.tracks.length * 80}px`;
  renderRuler(width / state.pixelsPerSecond);
  renderTrackStructure();
  renderClips();
  updatePlayheadVisual();
}

function ensurePlayheadVisible() {
  const x = state.playhead * state.pixelsPerSecond;
  const left = elements.timelineScroll.scrollLeft;
  const right = left + elements.timelineScroll.clientWidth;
  if (x < left + 25) elements.timelineScroll.scrollLeft = Math.max(0, x - 25);
  else if (x > right - 25) {
    elements.timelineScroll.scrollLeft = x - elements.timelineScroll.clientWidth + 25;
  }
}

function selectClipAtTime(clip, timelineTime) {
  state.selectedClipId = clip.id;
  state.activeTrackId = clip.trackId;
  state.timelinePreview = true;
  state.playhead = clamp(timelineTime, clip.start, Timeline.clipEnd(clip));
  const asset = assetForClip(clip);
  if (asset?.type === "video") {
    state.pendingVideoSeek = clip.sourceIn + (state.playhead - clip.start);
  }
  renderComposition();
}

function previewClipAtTime(clip, timelineTime) {
  state.timelinePreview = true;
  state.playhead = clamp(timelineTime, clip.start, Timeline.clipEnd(clip));
  const asset = assetForClip(clip);
  if (asset?.type === "video") {
    state.pendingVideoSeek = clip.sourceIn + (state.playhead - clip.start);
  }
  renderComposition();
}

function setPlayhead(time, syncPreview = true) {
  const maximum = Math.max(Timeline.timelineEnd(state.clips), 0);
  state.playhead = clamp(time, 0, maximum);
  const selected = selectedClip();
  const selectedIsActive =
    selected &&
    state.playhead >= selected.start &&
    state.playhead < Timeline.clipEnd(selected);
  const clip = selectedIsActive ? selected : topClipAtPlayhead();

  if (syncPreview && clip) previewClipAtTime(clip, state.playhead);
  else if (!clip) {
    state.selectedClipId = null;
    elements.video.pause();
    renderComposition();
  }

  updatePlayheadVisual();
}

function stepPlayheadFrames(frameDelta) {
  if (Timeline.timelineEnd(state.clips) <= 0) return;
  elements.video.pause();
  pauseOverlayVideos();
  const nextTime = Timeline.snapFrameTime(
    state.playhead + frameDelta / Timeline.FRAME_RATE,
  );
  setPlayhead(nextTime);
  ensurePlayheadVisible();
}

function timelineTimeFromPointer(event) {
  const rect = elements.timelineContent.getBoundingClientRect();
  return Math.max(0, (event.clientX - rect.left) / state.pixelsPerSecond);
}

function splitAtPlayhead() {
  const clip =
    selectedClip() && Timeline.findClipAt([selectedClip()], state.playhead)
      ? selectedClip()
      : Timeline.findClipAt(state.clips, state.playhead);
  if (!clip) return;

  const result = Timeline.splitClip(
    state.clips,
    clip.id,
    state.playhead,
    crypto.randomUUID(),
  );
  if (!result.rightId) return;

  state.clips = result.clips;
  state.selectedClipId = result.rightId;
  renderTimeline();
  renderComposition();
  commitEdit();
}

function deleteSelectedClip() {
  if (state.selectedClipId) {
    state.clips = Timeline.deleteClip(state.clips, state.selectedClipId);
    state.selectedClipId = null;
    state.playhead = Math.min(state.playhead, Timeline.timelineEnd(state.clips));
    elements.video.pause();
    renderTimeline();
    renderComposition();
    commitEdit();
    return;
  }

  const asset = selectedAsset();
  if (!asset) return;
  const referencedClips = state.clips.filter((clip) => clip.assetPath === asset.path);
  if (
    referencedClips.length > 0 &&
    !window.confirm(
      `"${asset.name}" is used by ${referencedClips.length} timeline clip(s). Delete the media and those clips?`,
    )
  ) {
    return;
  }

  elements.video.pause();
  state.assets = state.assets.filter((candidate) => candidate.path !== asset.path);
  state.clips = state.clips.filter((clip) => clip.assetPath !== asset.path);
  state.selectedPath = null;
  state.loadedAssetPath = null;
  state.timelinePreview = state.clips.length > 0;
  state.baseClipId = null;
  state.compositionSignature = "";
  state.playhead = Math.min(state.playhead, Timeline.timelineEnd(state.clips));
  elements.video.removeAttribute("src");
  elements.image.removeAttribute("src");
  elements.video.classList.remove("visible");
  elements.image.classList.remove("visible");
  elements.overlayStage.replaceChildren();
  elements.previewEmpty.classList.remove("hidden");
  elements.selectedName.textContent = "Nothing selected";
  elements.play.disabled = true;
  elements.seek.disabled = true;
  updateAddToTimelineButton();
  renderAssets();
  renderTimeline();
  if (state.timelinePreview) renderComposition();
  else updateTimelineControls();
  commitEdit();
}

function setTimelineZoom(nextPixelsPerSecond, anchorClientX = null) {
  const oldPixelsPerSecond = state.pixelsPerSecond;
  const rect = elements.timelineScroll.getBoundingClientRect();
  const anchorX =
    anchorClientX === null ? elements.timelineScroll.clientWidth / 2 : anchorClientX - rect.left;
  const anchorTime =
    (elements.timelineScroll.scrollLeft + anchorX) / Math.max(oldPixelsPerSecond, 0.01);
  state.pixelsPerSecond = clamp(nextPixelsPerSecond, 0.25, 240);
  elements.timelineZoom.value = String(state.pixelsPerSecond);
  renderTimeline();
  elements.timelineScroll.scrollLeft = anchorTime * state.pixelsPerSecond - anchorX;
}

function fitTimelineToArea() {
  const totalSeconds = Math.max(15, Timeline.timelineEnd(state.clips) + 5);
  const availableWidth = Math.max(1, elements.timelineScroll.clientWidth - 8);
  state.pixelsPerSecond = clamp(availableWidth / totalSeconds, 0.25, 240);
  elements.timelineZoom.value = String(state.pixelsPerSecond);
  renderTimeline();
  elements.timelineScroll.scrollLeft = 0;
}

function resizeTimeline(event) {
  const drag = state.timelineResizeDrag;
  if (!drag) return;
  const maximum = Math.max(150, window.innerHeight * 0.65);
  const height = clamp(drag.startHeight + drag.startY - event.clientY, 150, maximum);
  elements.editorArea.style.setProperty("--timeline-height", `${height}px`);
  renderTimeline();
  updateCanvasSurface();
}

function endTimelineResize() {
  if (!state.timelineResizeDrag) return;
  state.timelineResizeDrag = null;
  elements.timelineResizer.classList.remove("dragging");
}

function handleTimelinePointerMove(event) {
  const drag = state.timelineDrag;
  if (!drag) return;
  event.preventDefault();

  if (drag.mode === "playhead") {
    setPlayhead(timelineTimeFromPointer(event));
    return;
  }

  const delta = (event.clientX - drag.startX) / state.pixelsPerSecond;
  if (drag.mode === "move") {
    const lane = document.elementFromPoint(event.clientX, event.clientY)?.closest(".track-lane");
    const requestedTrackId = lane?.dataset.trackId;
    const clipKind = drag.baseClip.type === "audio" ? "audio" : "video";
    const targetTrackId =
      requestedTrackId && trackKind(requestedTrackId) === clipKind
        ? requestedTrackId
        : drag.baseClip.trackId;
    const rawStart = drag.baseClip.start + delta;
    let targetStart = state.timelineSnapEnabled
      ? Timeline.snapTime(rawStart, state.pixelsPerSecond)
      : rawStart;
    if (state.timelineSnapEnabled && Math.abs(targetStart - rawStart) < 0.00005) {
      const rawEnd = rawStart + Timeline.clipDuration(drag.baseClip);
      const snappedEnd = Timeline.snapTime(rawEnd, state.pixelsPerSecond);
      if (snappedEnd !== rawEnd) targetStart = snappedEnd - Timeline.clipDuration(drag.baseClip);
    }
    state.activeTrackId = targetTrackId;
    state.clips = Timeline.moveClip(
      drag.baseClips,
      drag.clipId,
      targetStart,
      targetTrackId,
    );
  } else if (drag.mode === "trim-left") {
    const targetTime = drag.baseClip.start + delta;
    state.clips = Timeline.trimClipLeft(
      drag.baseClips,
      drag.clipId,
      state.timelineSnapEnabled
        ? Timeline.snapTime(targetTime, state.pixelsPerSecond)
        : targetTime,
    );
  } else if (drag.mode === "trim-right") {
    const targetTime = Timeline.clipEnd(drag.baseClip) + delta;
    state.clips = Timeline.trimClipRight(
      drag.baseClips,
      drag.clipId,
      state.timelineSnapEnabled
        ? Timeline.snapTime(targetTime, state.pixelsPerSecond)
        : targetTime,
    );
  }

  renderTimeline();
  renderComposition();
}

function endTimelineDrag() {
  if (!state.timelineDrag) return;
  const completedDrag = state.timelineDrag;
  state.timelineDrag = null;
  renderTimeline();
  renderComposition();
  if (completedDrag.mode !== "playhead") commitEdit();
}

function compositionKey(activeClips, baseClip) {
  return `${baseClip?.id || "none"}|${activeClips.map((clip) => clip.id).join(",")}`;
}

function overlayVideos() {
  return [
    ...elements.overlayStage.querySelectorAll(
      "video.composition-overlay, audio.composition-audio",
    ),
  ];
}

function pauseOverlayVideos() {
  for (const video of overlayVideos()) video.pause();
}

async function playOverlayVideos() {
  for (const video of overlayVideos()) {
    try {
      await video.play();
    } catch {
      // A layer may still be loading; loadedmetadata will start it when ready.
    }
  }
}

function beginTextPositionDrag(event, clipId) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  state.selectedClipId = clipId;
  state.textDrag = { clipId };
  renderTimeline();
  renderComposition();
}

function updateTextPosition(event) {
  if (!state.textDrag) return;
  const rect = elements.compositionSurface.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  state.clips = Timeline.updateTextClip(state.clips, state.textDrag.clipId, { x, y });
  renderComposition();
}

function evenSpan(value, maximum) {
  const span = Math.max(2, Math.min(maximum, Math.round(value)));
  if (span % 2 === 0) return span;
  return span < maximum ? span + 1 : span - 1;
}

function blurPixelRegion(effect, padding = 0) {
  const canvas = currentCanvas();
  const normalized = Timeline.normalizeBlurEffect(effect);
  const baseWidth = evenSpan(canvas.width * (normalized.width / 100), canvas.width);
  const baseHeight = evenSpan(canvas.height * (normalized.height / 100), canvas.height);
  const baseX = Math.min(
    canvas.width - baseWidth,
    Math.max(0, Math.round(canvas.width * (normalized.x / 100) - baseWidth / 2)),
  );
  const baseY = Math.min(
    canvas.height - baseHeight,
    Math.max(0, Math.round(canvas.height * (normalized.y / 100) - baseHeight / 2)),
  );
  const left = Math.max(0, baseX - padding);
  const top = Math.max(0, baseY - padding);
  const right = Math.min(canvas.width, baseX + baseWidth + padding);
  const bottom = Math.min(canvas.height, baseY + baseHeight + padding);
  return {
    x: left,
    y: top,
    width: evenSpan(right - left, canvas.width - left),
    height: evenSpan(bottom - top, canvas.height - top),
  };
}

function blurTrackingPoints(clip) {
  const duration = Math.max(
    clip.sourceOut || 0,
    clip.assetDuration || 0,
    Timeline.clipDuration(clip),
  );
  const sourceStart = Number(clip.sourceIn) || 0;
  const sourceEnd = Number(clip.sourceOut) || sourceStart + Timeline.clipDuration(clip);
  const keyframes = Timeline.normalizeBlurKeyframes(clip.keyframes, duration, clip.effect);
  return [
    { time: Number(clip.start), effect: Timeline.blurEffectAt(clip, Number(clip.start)) },
    ...keyframes
      .filter((keyframe) => keyframe.time >= sourceStart && keyframe.time <= sourceEnd)
      .map((keyframe) => ({
        time: Number(clip.start) + (keyframe.time - sourceStart),
        effect: keyframe.effect,
      })),
    { time: Timeline.clipEnd(clip), effect: Timeline.blurEffectAt(clip, Timeline.clipEnd(clip)) },
  ]
    .sort((left, right) => left.time - right.time)
    .filter((point, index, list) => index === 0 || Math.abs(point.time - list[index - 1].time) > 0.0001);
}

function interpolateTrackingPosition(points, timelineTime) {
  if (points.length === 0) return { x: 0, y: 0 };
  const time = Number(timelineTime);
  if (time <= points[0].time) return points[0];
  const last = points[points.length - 1];
  if (time >= last.time) return last;
  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];
    if (time >= left.time && time <= right.time) {
      const span = Math.max(0.0001, right.time - left.time);
      const amount = (time - left.time) / span;
      return {
        x: left.x + (right.x - left.x) * amount,
        y: left.y + (right.y - left.y) * amount,
      };
    }
  }
  return last;
}

function exportSafeBlurRegion(clip) {
  const canvas = currentCanvas();
  if (!blurHasTracking(clip)) {
    return blurPixelRegion(Timeline.blurEffectAt(clip, state.playhead), 0);
  }

  const points = blurTrackingPoints(clip);
  const baseRegions = points.map((point) =>
    blurPixelRegion(point.effect, BLUR_EXPORT_SAFE_PADDING_PX),
  );
  const width = evenSpan(
    Math.max(...baseRegions.map((region) => region.width)),
    canvas.width,
  );
  const height = evenSpan(
    Math.max(...baseRegions.map((region) => region.height)),
    canvas.height,
  );
  const positioned = points.map((point) => {
    const effect = Timeline.normalizeBlurEffect(point.effect);
    return {
      time: point.time,
      x: Math.min(
        canvas.width - width,
        Math.max(0, Math.round(canvas.width * (effect.x / 100) - width / 2)),
      ),
      y: Math.min(
        canvas.height - height,
        Math.max(0, Math.round(canvas.height * (effect.y / 100) - height / 2)),
      ),
    };
  });
  const position = interpolateTrackingPosition(positioned, state.playhead);
  return { x: position.x, y: position.y, width, height };
}

function applyBlurRegionStyle(element, region, strength) {
  const canvas = currentCanvas();
  element.style.left = `${((region.x + region.width / 2) / canvas.width) * 100}%`;
  element.style.top = `${((region.y + region.height / 2) / canvas.height) * 100}%`;
  element.style.width = `${(region.width / canvas.width) * 100}%`;
  element.style.height = `${(region.height / canvas.height) * 100}%`;
  element.style.setProperty("--blur-preview", `${Math.max(1, strength / 2)}px`);
}

function applyBlurOverlayStyle(element, effect) {
  element.style.left = `${effect.x}%`;
  element.style.top = `${effect.y}%`;
  element.style.width = `${effect.width}%`;
  element.style.height = `${effect.height}%`;
  element.style.setProperty("--blur-preview", `${Math.max(1, effect.strength / 2)}px`);
}

function applyBlurExportSafeStyle(element, clip) {
  const effect = Timeline.blurEffectAt(clip, state.playhead);
  applyBlurRegionStyle(element, exportSafeBlurRegion(clip), effect.strength);
}

function beginBlurTransform(event, clipId) {
  const clip = state.clips.find((candidate) => candidate.id === clipId);
  if (!clip || clip.type !== "blur" || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  state.selectedClipId = clipId;
  state.activeTrackId = clip.trackId;
  const effect = Timeline.blurEffectAt(clip, state.playhead);
  state.blurDrag = {
    clipId,
    mode: event.target.dataset.handle ? "resize" : "move",
    handle: event.target.dataset.handle || null,
    startX: event.clientX,
    startY: event.clientY,
    effect,
  };
  renderTimeline();
  renderComposition();
}

function updateBlurTransform(event) {
  const drag = state.blurDrag;
  if (!drag) return;
  const rect = elements.compositionSurface.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const deltaX = ((event.clientX - drag.startX) / rect.width) * 100;
  const deltaY = ((event.clientY - drag.startY) / rect.height) * 100;
  const next = { ...drag.effect };

  if (drag.mode === "move") {
    next.x += deltaX;
    next.y += deltaY;
  } else {
    const growsRight = drag.handle.includes("e") ? 1 : -1;
    const growsDown = drag.handle.includes("s") ? 1 : -1;
    next.width += deltaX * growsRight;
    next.height += deltaY * growsDown;
    next.x += deltaX / 2;
    next.y += deltaY / 2;
  }

  state.clips = Timeline.updateBlurClipAtTime(state.clips, drag.clipId, state.playhead, {
    effect: next,
  });
  syncBlurDialogFromClip();
  renderComposition();
}

function endBlurTransform() {
  if (!state.blurDrag) return;
  state.blurDrag = null;
  commitEdit();
}

function renderComposition() {
  if (!state.timelinePreview) return;

  const activeClips = clipsAtPlayhead();
  const mediaClips = activeClips.filter((clip) => ["video", "image"].includes(clip.type));
  const baseClip = mediaClips[0] || null;
  state.baseClipId = baseClip?.id || null;
  state.compositionSignature = compositionKey(activeClips, baseClip);
  elements.overlayStage.replaceChildren();

  if (baseClip) {
    const asset = assetForClip(baseClip);
    if (asset && !asset.missing) {
      if (asset.type === "video") {
        state.pendingVideoSeek = baseClip.sourceIn + (state.playhead - baseClip.start);
      }
      selectAsset(asset, {
        keepView: true,
        fromComposition: true,
        preserveSelection: true,
      });
      elements.selectedName.textContent = "Timeline composition";
      applyPendingVideoSeek();
      applyMediaClipStyle(
        asset.type === "video" ? elements.video : elements.image,
        baseClip,
      );
      if (asset.type === "video") {
        elements.video.muted = Boolean(baseClip.audioDetached || baseClip.muted);
        elements.video.volume = clamp(baseClip.volume ?? 1, 0, 1);
      }
    } else {
      elements.video.pause();
      elements.video.classList.remove("visible");
      elements.image.classList.remove("visible");
      elements.play.disabled = true;
      elements.seek.disabled = true;
    }
  } else {
    elements.video.pause();
    elements.video.classList.remove("visible");
    elements.image.classList.remove("visible");
    elements.play.disabled = true;
    elements.seek.disabled = true;
    elements.currentTime.textContent = "00:00";
    elements.duration.textContent = activeClips.some((clip) => clip.type === "text")
      ? "TEXT"
      : "00:00";
    elements.selectedName.textContent = "Timeline composition";
  }

  for (const clip of activeClips) {
    const zIndex = trackOrder(clip.trackId) + 2;

    if (clip.type === "blur") {
      const effect = Timeline.blurEffectAt(clip, state.playhead);
      if (blurHasTracking(clip)) {
        const exportSafe = document.createElement("div");
        exportSafe.className = "blur-export-safe";
        exportSafe.dataset.clipId = clip.id;
        exportSafe.style.zIndex = String(zIndex + 99);
        applyBlurExportSafeStyle(exportSafe, clip);
        elements.overlayStage.append(exportSafe);
      }
      const blur = document.createElement("div");
      blur.className = "blur-overlay";
      blur.classList.toggle("tracking", blurHasTracking(clip));
      blur.classList.toggle("selected", clip.id === state.selectedClipId);
      blur.dataset.clipId = clip.id;
      blur.style.zIndex = String(zIndex + 100);
      applyBlurOverlayStyle(blur, effect);
      blur.title = "Drag to move. Drag a corner to resize.";
      for (const handle of ["nw", "ne", "sw", "se"]) {
        const grip = document.createElement("span");
        grip.className = `blur-handle ${handle}`;
        grip.dataset.handle = handle;
        blur.append(grip);
      }
      blur.addEventListener("pointerdown", (event) => beginBlurTransform(event, clip.id));
      blur.addEventListener("dblclick", (event) => {
        event.stopPropagation();
        state.selectedClipId = clip.id;
        openBlurDialog("edit");
      });
      elements.overlayStage.append(blur);
      continue;
    }

    if (clip.type === "text") {
      const text = document.createElement("div");
      text.className = "text-overlay";
      text.classList.toggle("selected", clip.id === state.selectedClipId);
      text.textContent = clip.text;
      text.style.left = `${clip.x}%`;
      text.style.top = `${clip.y}%`;
      text.style.color = clip.color;
      const previewHeight = elements.compositionSurface.clientHeight || 540;
      text.style.fontSize =
        `${Math.max(8, (clip.fontSize * previewHeight) / currentCanvas().height)}px`;
      text.style.zIndex = String(zIndex + 200);
      text.addEventListener("pointerdown", (event) =>
        beginTextPositionDrag(event, clip.id),
      );
      text.addEventListener("dblclick", (event) => {
        event.stopPropagation();
        state.selectedClipId = clip.id;
        openTextDialog("edit");
      });
      elements.overlayStage.append(text);
      continue;
    }

    if (clip.type === "audio") {
      const asset = assetForClip(clip);
      if (!asset) continue;
      const audio = document.createElement("audio");
      audio.className = "composition-audio";
      audio.dataset.clipId = clip.id;
      audio.src = asset.url;
      audio.preload = "auto";
      audio.muted = Boolean(clip.muted);
      audio.volume = clamp(clip.volume ?? 1, 0, 1);
      const sourceTime = clip.sourceIn + (state.playhead - clip.start);
      audio.addEventListener("loadedmetadata", async () => {
        audio.currentTime = clamp(sourceTime, 0, audio.duration || sourceTime);
        if (baseClip?.type !== "video") {
          elements.play.disabled = false;
          elements.seek.disabled = false;
          elements.seek.max = String(audio.duration || clip.sourceOut);
          updatePlayback(audio);
        }
        if (!elements.video.paused) {
          try {
            await audio.play();
          } catch {
            // The base video remains authoritative if detached audio cannot autoplay.
          }
        }
      });
      audio.addEventListener("timeupdate", () => {
        if (baseClip?.type === "video" || audio !== playbackElement()) return;
        if (audio.currentTime >= clip.sourceOut - 0.02) {
          audio.pause();
          state.playhead = Timeline.clipEnd(clip);
        } else if (audio.currentTime >= clip.sourceIn) {
          state.playhead = clip.start + (audio.currentTime - clip.sourceIn);
        }
        updatePlayback(audio);
        updatePlayheadVisual();
        ensurePlayheadVisible();
        syncCompositionDuringPlayback();
      });
      audio.addEventListener("play", () => updatePlayback(audio));
      audio.addEventListener("pause", () => updatePlayback(audio));
      elements.overlayStage.append(audio);
      continue;
    }

    if (clip.id === baseClip?.id) continue;
    const asset = assetForClip(clip);
    if (!asset) continue;
    const layer = document.createElement(asset.type === "video" ? "video" : "img");
    layer.className = "composition-overlay";
    layer.dataset.clipId = clip.id;
    layer.style.zIndex = String(zIndex);
    layer.src = asset.url;
    applyMediaClipStyle(layer, clip);

    if (asset.type === "video") {
      layer.muted = Boolean(clip.audioDetached || clip.muted);
      layer.volume = clamp(clip.volume ?? 1, 0, 1);
      layer.preload = "auto";
      const sourceTime = clip.sourceIn + (state.playhead - clip.start);
      layer.addEventListener("loadedmetadata", async () => {
        layer.currentTime = clamp(sourceTime, 0, layer.duration || sourceTime);
        if (!elements.video.paused) {
          try {
            await layer.play();
          } catch {
            // The base video remains authoritative if an overlay cannot autoplay.
          }
        }
      });
    }

    elements.overlayStage.append(layer);
  }

  if (baseClip?.type === "video") updatePlayback();
  updateTimelineControls();
  renderTransformBox();
}

function syncCompositionDuringPlayback() {
  if (!state.timelinePreview) return;
  const activeClips = clipsAtPlayhead();
  const mediaClips = activeClips.filter((clip) => ["video", "image"].includes(clip.type));
  const baseClip = mediaClips[0] || null;
  const nextSignature = compositionKey(activeClips, baseClip);
  if (nextSignature !== state.compositionSignature) {
    renderComposition();
    return;
  }

  for (const video of overlayVideos()) {
    const clip = state.clips.find((candidate) => candidate.id === video.dataset.clipId);
    if (!clip || video.readyState < 1) continue;
    const desired = clip.sourceIn + (state.playhead - clip.start);
    if (Math.abs(video.currentTime - desired) > 0.15) video.currentTime = desired;
  }
  updateActiveBlurOverlays();
}

function updateActiveBlurOverlays() {
  for (const overlay of elements.overlayStage.querySelectorAll(".blur-export-safe")) {
    const clip = state.clips.find((candidate) => candidate.id === overlay.dataset.clipId);
    if (!clip) continue;
    applyBlurExportSafeStyle(overlay, clip);
  }
  for (const overlay of elements.overlayStage.querySelectorAll(".blur-overlay")) {
    const clip = state.clips.find((candidate) => candidate.id === overlay.dataset.clipId);
    if (!clip) continue;
    applyBlurOverlayStyle(overlay, Timeline.blurEffectAt(clip, state.playhead));
  }
  syncBlurDialogFromClip();
}

function openTextDialog(mode) {
  state.textDialogMode = mode;
  const clip = mode === "edit" ? selectedClip() : null;
  if (mode === "edit" && clip?.type !== "text") return;

  elements.textDialogTitle.textContent = mode === "edit" ? "Edit text" : "Add text";
  elements.textValue.value = clip?.text || "";
  elements.textDuration.value = String(clip ? Timeline.clipDuration(clip) : 5);
  elements.textSize.value = String(clip?.fontSize || 48);
  elements.textColor.value = clip?.color || "#ffffff";
  elements.textDialog.showModal();
  elements.textValue.focus();
}

function applyTextDialog() {
  const text = elements.textValue.value.trim();
  if (!text) return;
  const duration = Number(elements.textDuration.value);
  const fontSize = Number(elements.textSize.value);
  const color = elements.textColor.value;

  if (state.textDialogMode === "edit") {
    state.clips = Timeline.updateTextClip(state.clips, state.selectedClipId, {
      text,
      duration,
      fontSize,
      color,
    });
  } else {
    const videoTrackCount =
      state.tracks.filter((track) => trackKind(track.id) === "video").length;
    if (videoTrackCount === 1) addTrack(false);
    const textTrack = targetVideoTrack();
    if (!textTrack) return;
    const clip = Timeline.createTextClip({
      id: crypto.randomUUID(),
      text,
      trackId: textTrack.id,
      start: state.playhead,
      duration,
      fontSize,
      color,
    });
    state.clips = [...state.clips, clip];
    state.selectedClipId = clip.id;
    state.timelinePreview = true;
  }

  elements.textDialog.close();
  renderTimeline();
  renderComposition();
  commitEdit();
}

function blurValues() {
  return {
    duration: Number(elements.blurDuration.value),
    effect: {
      strength: Number(elements.blurStrength.value),
      width: Number(elements.blurWidth.value),
      height: Number(elements.blurHeight.value),
    },
  };
}

function syncBlurDialogFromClip() {
  const clip = selectedBlurClip();
  if (!clip || !elements.blurDialog.open) return;
  const effect = Timeline.blurEffectAt(clip, state.playhead);
  const count = blurTrackingCount(clip);
  elements.blurDuration.value = String(Timeline.clipDuration(clip));
  elements.blurStrength.value = String(effect.strength);
  elements.blurStrengthValue.textContent = String(effect.strength);
  elements.blurWidth.value = String(Math.round(effect.width));
  elements.blurHeight.value = String(Math.round(effect.height));
  elements.blurKeyframesStatus.textContent =
    count > 0
      ? `${count} tracking keyframe${count === 1 ? "" : "s"} • export-safe preview`
      : "Static blur";
  elements.clearBlurKeyframes.disabled = count === 0;
}

function previewBlurDialog() {
  const clip = selectedBlurClip();
  if (!clip) return;
  const values = blurValues();
  if (blurHasTracking(clip)) {
    state.clips = Timeline.updateBlurClipAtTime(
      Timeline.updateBlurClip(state.clips, clip.id, { duration: values.duration }),
      clip.id,
      state.playhead,
      values,
    );
  } else {
    state.clips = Timeline.updateBlurClip(state.clips, clip.id, values);
  }
  elements.blurStrengthValue.textContent = String(values.effect.strength);
  syncBlurDialogFromClip();
  renderTimeline();
  renderComposition();
}

function openBlurDialog(mode) {
  state.blurDialogMode = mode;
  const clip = mode === "edit" ? selectedBlurClip() : null;
  if (mode === "edit" && !clip) return;

  if (mode === "add") {
    const videoTrackCount =
      state.tracks.filter((track) => trackKind(track.id) === "video").length;
    state.blurAddedTrackId = null;
    if (videoTrackCount === 1) {
      const addedTrack = addTrack(false);
      state.blurAddedTrackId = addedTrack.id;
    }
    const blurTrack = targetVideoTrack();
    if (!blurTrack) return;
    const blurClip = Timeline.createBlurClip({
      id: crypto.randomUUID(),
      trackId: blurTrack.id,
      start: state.playhead,
      duration: 5,
    });
    state.clips = [...state.clips, blurClip];
    state.selectedClipId = blurClip.id;
    state.activeTrackId = blurTrack.id;
    state.timelinePreview = true;
    state.blurOriginal = null;
  } else {
    state.blurOriginal = structuredClone(clip);
    state.blurAddedTrackId = null;
  }

  const selected = selectedBlurClip();
  elements.blurDialogTitle.textContent = mode === "edit" ? "Edit blur" : "Add blur";
  elements.blurDuration.value = String(selected ? Timeline.clipDuration(selected) : 5);
  const effect = selected
    ? Timeline.blurEffectAt(selected, state.playhead)
    : Timeline.normalizeBlurEffect(null);
  elements.blurStrength.value = String(effect.strength);
  elements.blurStrengthValue.textContent = String(effect.strength);
  elements.blurWidth.value = String(Math.round(effect.width));
  elements.blurHeight.value = String(Math.round(effect.height));
  renderTimeline();
  renderComposition();
  if (!elements.blurDialog.open) elements.blurDialog.show();
  syncBlurDialogFromClip();
}

function cancelBlurDialog() {
  const clip = selectedBlurClip();
  if (state.blurDialogMode === "add" && clip) {
    state.clips = Timeline.deleteClip(state.clips, clip.id);
    state.selectedClipId = null;
    if (
      state.blurAddedTrackId &&
      !state.clips.some((candidate) => candidate.trackId === state.blurAddedTrackId)
    ) {
      state.tracks = state.tracks.filter((track) => track.id !== state.blurAddedTrackId);
      state.activeTrackId = state.tracks.find((track) => trackKind(track.id) === "video")?.id || "v1";
    }
  } else if (clip && state.blurOriginal) {
    state.clips = state.clips.map((candidate) =>
      candidate.id === clip.id ? structuredClone(state.blurOriginal) : candidate,
    );
  }
  state.blurOriginal = null;
  state.blurAddedTrackId = null;
  elements.blurDialog.close();
  renderTimeline();
  renderComposition();
}

function resetBlurDialog() {
  elements.blurStrength.value = "18";
  elements.blurStrengthValue.textContent = "18";
  elements.blurWidth.value = "24";
  elements.blurHeight.value = "16";
  previewBlurDialog();
}

function clearSelectedBlurTracking() {
  const clip = selectedBlurClip();
  if (!clip) return;
  state.clips = Timeline.clearBlurKeyframes(state.clips, clip.id, state.playhead);
  syncBlurDialogFromClip();
  renderTimeline();
  renderComposition();
  commitEdit();
}

function applyBlurDialog() {
  previewBlurDialog();
  state.blurOriginal = null;
  state.blurAddedTrackId = null;
  elements.blurDialog.close();
  commitEdit();
}

function beginMediaTransform(event) {
  const clip = selectedMediaClip();
  if (!clip || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const transform = Timeline.normalizeTransform(clip.transform, clip.trackId);
  const rect = elements.compositionSurface.getBoundingClientRect();
  const centerX = rect.left + (transform.x / 100) * rect.width;
  const centerY = rect.top + (transform.y / 100) * rect.height;
  const resize = Boolean(event.target.dataset.handle);
  state.mediaTransformDrag = {
    clipId: clip.id,
    mode: resize ? "resize" : "move",
    startX: event.clientX,
    startY: event.clientY,
    centerX,
    centerY,
    startDistance: Math.max(1, Math.hypot(event.clientX - centerX, event.clientY - centerY)),
    transform,
  };
}

function updateMediaTransform(event) {
  const drag = state.mediaTransformDrag;
  if (!drag) return;
  const rect = elements.compositionSurface.getBoundingClientRect();
  if (drag.mode === "move") {
    const x = drag.transform.x + ((event.clientX - drag.startX) / rect.width) * 100;
    const y = drag.transform.y + ((event.clientY - drag.startY) / rect.height) * 100;
    state.clips = Timeline.updateClipTransform(state.clips, drag.clipId, { x, y });
  } else {
    const distance = Math.hypot(event.clientX - drag.centerX, event.clientY - drag.centerY);
    state.clips = Timeline.updateClipTransform(state.clips, drag.clipId, {
      scale: drag.transform.scale * (distance / drag.startDistance),
    });
  }
  renderComposition();
}

function endMediaTransform() {
  if (!state.mediaTransformDrag) return;
  state.mediaTransformDrag = null;
  commitEdit();
}

function applyTransformMode(fitMode) {
  const clip = selectedMediaClip();
  if (!clip) return;
  state.clips = Timeline.updateClipTransform(state.clips, clip.id, { fitMode });
  renderComposition();
  commitEdit();
}

function resetSelectedTransform() {
  const clip = selectedMediaClip();
  if (!clip) return;
  const reset = Timeline.normalizeTransform(null, clip.trackId);
  state.clips = Timeline.updateClipTransform(state.clips, clip.id, reset);
  renderComposition();
  commitEdit();
}

function cropValues() {
  return {
    left: Number(elements.cropLeft.value) / 100,
    right: Number(elements.cropRight.value) / 100,
    top: Number(elements.cropTop.value) / 100,
    bottom: Number(elements.cropBottom.value) / 100,
  };
}

function previewCrop() {
  const clip = selectedMediaClip();
  if (!clip) return;
  state.clips = Timeline.updateClipTransform(state.clips, clip.id, {
    crop: cropValues(),
  });
  renderComposition();
}

function openCropDialog() {
  const clip = selectedMediaClip();
  if (!clip) return;
  const crop = Timeline.normalizeTransform(clip.transform, clip.trackId).crop;
  state.cropOriginal = structuredClone(crop);
  elements.cropLeft.value = String(Math.round(crop.left * 100));
  elements.cropRight.value = String(Math.round(crop.right * 100));
  elements.cropTop.value = String(Math.round(crop.top * 100));
  elements.cropBottom.value = String(Math.round(crop.bottom * 100));
  if (!elements.cropDialog.open) elements.cropDialog.show();
}

function cancelCropDialog() {
  const clip = selectedMediaClip();
  if (clip && state.cropOriginal) {
    state.clips = Timeline.updateClipTransform(state.clips, clip.id, {
      crop: state.cropOriginal,
    });
    renderComposition();
  }
  state.cropOriginal = null;
  elements.cropDialog.close();
}

function resetCropDialog() {
  elements.cropLeft.value = "0";
  elements.cropRight.value = "0";
  elements.cropTop.value = "0";
  elements.cropBottom.value = "0";
  previewCrop();
}

function applyCropDialog() {
  previewCrop();
  state.cropOriginal = null;
  elements.cropDialog.close();
  commitEdit();
}

function colorValues() {
  return {
    brightness: Number(elements.colorBrightness.value),
    contrast: Number(elements.colorContrast.value),
    saturation: Number(elements.colorSaturation.value),
    warmth: Number(elements.colorWarmth.value),
  };
}

function updateColorDialogLabels() {
  elements.colorBrightnessValue.textContent = `${Number(elements.colorBrightness.value)}`;
  elements.colorContrastValue.textContent = `${Number(elements.colorContrast.value)}%`;
  elements.colorSaturationValue.textContent = `${Number(elements.colorSaturation.value)}%`;
  elements.colorWarmthValue.textContent = `${Number(elements.colorWarmth.value)}`;
}

function previewColor() {
  const clip = selectedMediaClip();
  if (!clip) return;
  updateColorDialogLabels();
  state.clips = Timeline.updateClipColorAdjustment(state.clips, clip.id, colorValues());
  renderComposition();
}

function openColorDialog() {
  const clip = selectedMediaClip();
  if (!clip) return;
  const color = Timeline.normalizeColorAdjustment(clip.colorAdjustment);
  state.colorOriginal = structuredClone(color);
  elements.colorBrightness.value = String(color.brightness);
  elements.colorContrast.value = String(color.contrast);
  elements.colorSaturation.value = String(color.saturation);
  elements.colorWarmth.value = String(color.warmth);
  updateColorDialogLabels();
  if (!elements.colorDialog.open) elements.colorDialog.show();
}

function cancelColorDialog() {
  const clip = selectedMediaClip();
  if (clip && state.colorOriginal) {
    state.clips = Timeline.updateClipColorAdjustment(
      state.clips,
      clip.id,
      state.colorOriginal,
    );
    renderComposition();
  }
  state.colorOriginal = null;
  elements.colorDialog.close();
}

function resetColorDialog() {
  elements.colorBrightness.value = "0";
  elements.colorContrast.value = "100";
  elements.colorSaturation.value = "100";
  elements.colorWarmth.value = "0";
  previewColor();
}

function applyColorDialog() {
  previewColor();
  state.colorOriginal = null;
  elements.colorDialog.close();
  commitEdit();
}

elements.addMedia.addEventListener("click", addMedia);
elements.addToTimeline.addEventListener("click", addSelectedAssetToTimeline);
elements.addTrack.addEventListener("click", addTrack);
elements.detachAudio.addEventListener("click", detachSelectedAudio);
elements.muteAudio.addEventListener("click", () => {
  const clip = audioEditableClip();
  if (clip) setSelectedAudio({ muted: !clip.muted });
});
elements.audioVolume.addEventListener("input", () => {
  setSelectedAudio({ volume: Number(elements.audioVolume.value) / 100 }, false);
});
elements.audioVolume.addEventListener("change", () => commitEdit());
elements.resetAudio.addEventListener("click", () =>
  setSelectedAudio({ volume: 1, muted: false }),
);
elements.canvasLandscape.addEventListener("click", () => setCanvas("landscape"));
elements.canvasPortrait.addEventListener("click", () => setCanvas("portrait"));
elements.transformFit.addEventListener("click", () => applyTransformMode("fit"));
elements.transformFill.addEventListener("click", () => applyTransformMode("fill"));
elements.transformCrop.addEventListener("click", openCropDialog);
elements.transformColor.addEventListener("click", openColorDialog);
elements.transformReset.addEventListener("click", resetSelectedTransform);
elements.transformBox.addEventListener("pointerdown", beginMediaTransform);
for (const input of [
  elements.cropLeft,
  elements.cropRight,
  elements.cropTop,
  elements.cropBottom,
]) {
  input.addEventListener("input", previewCrop);
}
elements.cropForm.addEventListener("submit", (event) => {
  event.preventDefault();
  applyCropDialog();
});
elements.closeCropDialog.addEventListener("click", cancelCropDialog);
elements.cancelCrop.addEventListener("click", cancelCropDialog);
elements.resetCrop.addEventListener("click", resetCropDialog);
elements.cropDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  cancelCropDialog();
});
for (const input of [
  elements.colorBrightness,
  elements.colorContrast,
  elements.colorSaturation,
  elements.colorWarmth,
]) {
  input.addEventListener("input", previewColor);
}
elements.colorForm.addEventListener("submit", (event) => {
  event.preventDefault();
  applyColorDialog();
});
elements.closeColorDialog.addEventListener("click", cancelColorDialog);
elements.cancelColor.addEventListener("click", cancelColorDialog);
elements.resetColor.addEventListener("click", resetColorDialog);
elements.colorDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  cancelColorDialog();
});
elements.exportVideo.addEventListener("click", prepareExportDialog);
elements.startExport.addEventListener("click", exportTimeline);
elements.cancelExport.addEventListener("click", () => elements.exportDialog.close());
elements.closeExport.addEventListener("click", () => elements.exportDialog.close());
elements.showExportFolder.addEventListener("click", () => {
  if (state.lastExportPath) window.anonEditor.showInFolder(state.lastExportPath);
});
elements.openExportFile.addEventListener("click", async () => {
  if (!state.lastExportPath) return;
  const error = await window.anonEditor.openFile(state.lastExportPath);
  if (error) showStatus(`Could not open export: ${error}`, true);
});
elements.newProject.addEventListener("click", newProject);
elements.openProject.addEventListener("click", openProject);
elements.saveProject.addEventListener("click", saveProject);
elements.undo.addEventListener("click", undoEdit);
elements.redo.addEventListener("click", redoEdit);
elements.copyClip.addEventListener("click", copySelectedClip);
elements.pasteClip.addEventListener("click", pasteClipboardClip);
elements.addText.addEventListener("click", () => openTextDialog("add"));
elements.editText.addEventListener("click", () => openTextDialog("edit"));
elements.closeTextDialog.addEventListener("click", () => elements.textDialog.close());
elements.cancelText.addEventListener("click", () => elements.textDialog.close());
elements.textForm.addEventListener("submit", (event) => {
  event.preventDefault();
  applyTextDialog();
});
elements.addBlur.addEventListener("click", () => openBlurDialog("add"));
elements.editBlur.addEventListener("click", () => openBlurDialog("edit"));
for (const input of [
  elements.blurDuration,
  elements.blurStrength,
  elements.blurWidth,
  elements.blurHeight,
]) {
  input.addEventListener("input", previewBlurDialog);
}
elements.blurForm.addEventListener("submit", (event) => {
  event.preventDefault();
  applyBlurDialog();
});
elements.closeBlurDialog.addEventListener("click", cancelBlurDialog);
elements.cancelBlur.addEventListener("click", cancelBlurDialog);
elements.resetBlur.addEventListener("click", resetBlurDialog);
elements.clearBlurKeyframes.addEventListener("click", clearSelectedBlurTracking);
elements.blurDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  cancelBlurDialog();
});
window.anonEditor.onPickRequested(addMedia);
window.anonEditor.onNewProjectRequested(newProject);
window.anonEditor.onOpenProjectRequested(openProject);
window.anonEditor.onSaveProjectRequested(saveProject);
window.anonEditor.onExportRequested(prepareExportDialog);
window.anonEditor.onExportProgress(({ progress, stage }) => {
  if (!state.exportInProgress) return;
  elements.exportProgress.value = clamp(Number(progress) || 0, 0, 1);
  elements.exportStage.textContent = stage;
  if (progress >= 1) elements.exportTitle.textContent = "Verifying anonymous output";
});

elements.video.addEventListener("loadedmetadata", () => {
  const asset = state.assets.find((candidate) => candidate.path === state.loadedAssetPath);
  if (asset?.type === "video") {
    asset.duration = elements.video.duration;
    asset.width = elements.video.videoWidth;
    asset.height = elements.video.videoHeight;
    if (detectCanvasFromAsset(asset, false)) commitEdit();
  }
  elements.seek.max = String(elements.video.duration || 0);
  applyPendingVideoSeek();
  updatePlayback();
  updateAddToTimelineButton();
  renderAssets();
});

elements.image.addEventListener("load", () => {
  const asset = state.assets.find((candidate) => candidate.path === state.loadedAssetPath);
  if (asset?.type !== "image") return;
  asset.width = elements.image.naturalWidth;
  asset.height = elements.image.naturalHeight;
  if (detectCanvasFromAsset(asset, false)) commitEdit();
});

elements.video.addEventListener("timeupdate", () => {
  updatePlayback();
  const clip = state.timelinePreview
    ? state.clips.find((candidate) => candidate.id === state.baseClipId)
    : selectedClip();
  if (!clip || clip.assetPath !== state.loadedAssetPath) return;

  if (elements.video.currentTime >= clip.sourceOut - 0.02) {
    const boundary = Timeline.clipEnd(clip);
    if (continueTimelinePlaybackAt(boundary)) return;
    elements.video.pause();
    state.playhead = boundary;
  } else if (elements.video.currentTime >= clip.sourceIn) {
    state.playhead = clip.start + (elements.video.currentTime - clip.sourceIn);
  }
  updatePlayheadVisual();
  ensurePlayheadVisible();
  syncCompositionDuringPlayback();
});

elements.video.addEventListener("play", () => {
  updatePlayback();
  playOverlayVideos();
});
elements.video.addEventListener("pause", () => {
  updatePlayback();
  pauseOverlayVideos();
});
elements.video.addEventListener("ended", updatePlayback);

async function togglePlayback() {
  const media = playbackElement();
  if (elements.play.disabled || !media) return;
  const clip = playbackClip(media);
  if (clip && media.currentTime >= clip.sourceOut - 0.02) {
    media.currentTime = clip.sourceIn;
    state.playhead = clip.start;
  }

  if (media.paused) {
    try {
      await media.play();
    } catch (error) {
      showStatus(error.message || "Media cannot be played", true);
    }
  }
  else media.pause();
}

elements.play.addEventListener("click", () => {
  state.selectedClipId = null;
  renderTimeline();
  renderComposition();
  togglePlayback();
});

async function togglePreviewFullscreen() {
  try {
    if (document.fullscreenElement === elements.viewport) await document.exitFullscreen();
    else await elements.viewport.requestFullscreen();
  } catch (error) {
    showStatus(error.message || "Fullscreen preview is unavailable", true);
  }
}

elements.previewFullscreen.addEventListener("pointerdown", (event) => event.stopPropagation());
elements.previewFullscreen.addEventListener("click", togglePreviewFullscreen);
document.addEventListener("fullscreenchange", () => {
  const active = document.fullscreenElement === elements.viewport;
  elements.previewFullscreen.textContent = active ? "×" : "⛶";
  elements.previewFullscreen.title = active ? "Exit fullscreen preview" : "Fullscreen preview";
  elements.previewFullscreen.setAttribute(
    "aria-label",
    active ? "Exit fullscreen preview" : "Fullscreen preview",
  );
  requestAnimationFrame(() => {
    updateCanvasSurface();
    applyTransform();
  });
});

elements.seek.addEventListener("input", () => {
  const media = playbackElement();
  if (!media) return;
  const clip = playbackClip(media);
  let time = Number(elements.seek.value);
  if (clip) time = clamp(time, clip.sourceIn, clip.sourceOut);
  media.currentTime = time;
  if (clip) state.playhead = clip.start + (time - clip.sourceIn);
  updatePlayback(media);
  updatePlayheadVisual();
  renderComposition();
});

elements.zoomIn.addEventListener("click", () => setZoom(state.zoom * 1.2));
elements.zoomOut.addEventListener("click", () => setZoom(state.zoom / 1.2));
elements.zoomFit.addEventListener("click", resetView);

elements.viewport.addEventListener(
  "wheel",
  (event) => {
    if (!activeMediaElement()) return;
    event.preventDefault();
    setZoom(state.zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12), {
      x: event.clientX,
      y: event.clientY,
    });
  },
  { passive: false },
);

elements.viewport.addEventListener("pointerdown", (event) => {
  if (!activeMediaElement() || event.button !== 0) return;
  state.draggingPreview = true;
  state.pointerX = event.clientX;
  state.pointerY = event.clientY;
  elements.viewport.classList.add("dragging");
  elements.viewport.setPointerCapture(event.pointerId);
});

elements.viewport.addEventListener("pointermove", (event) => {
  if (!state.draggingPreview) return;
  state.panX += event.clientX - state.pointerX;
  state.panY += event.clientY - state.pointerY;
  state.pointerX = event.clientX;
  state.pointerY = event.clientY;
  applyTransform();
});

function endPreviewDrag(event) {
  if (!state.draggingPreview) return;
  state.draggingPreview = false;
  elements.viewport.classList.remove("dragging");
  if (elements.viewport.hasPointerCapture(event.pointerId)) {
    elements.viewport.releasePointerCapture(event.pointerId);
  }
}

elements.viewport.addEventListener("pointerup", endPreviewDrag);
elements.viewport.addEventListener("pointercancel", endPreviewDrag);

elements.timelineRuler.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  state.selectedClipId = null;
  state.timelinePreview = true;
  state.timelineDrag = { mode: "playhead" };
  setPlayhead(timelineTimeFromPointer(event));
});

elements.playhead.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  state.selectedClipId = null;
  state.timelinePreview = true;
  state.timelineDrag = { mode: "playhead" };
  renderTimeline();
});

document.addEventListener("pointermove", (event) => {
  handleTimelinePointerMove(event);
  updateTextPosition(event);
  updateBlurTransform(event);
  updateMediaTransform(event);
  resizeTimeline(event);
});
document.addEventListener("pointerup", () => {
  endTimelineDrag();
  endBlurTransform();
  endMediaTransform();
  endTimelineResize();
  const movedText = Boolean(state.textDrag);
  state.textDrag = null;
  if (movedText) commitEdit();
});
document.addEventListener("pointercancel", () => {
  endTimelineDrag();
  endBlurTransform();
  endMediaTransform();
  endTimelineResize();
  const movedText = Boolean(state.textDrag);
  state.textDrag = null;
  if (movedText) commitEdit();
});

elements.splitClip.addEventListener("click", splitAtPlayhead);
elements.deleteClip.addEventListener("click", deleteSelectedClip);

elements.timelineZoom.addEventListener("input", () => {
  setTimelineZoom(Number(elements.timelineZoom.value));
});

elements.timelineScroll.addEventListener(
  "wheel",
  (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    setTimelineZoom(state.pixelsPerSecond * factor, event.clientX);
  },
  { passive: false },
);

elements.timelineScroll.addEventListener("scroll", () => {
  elements.trackLabelList.style.transform =
    `translateY(${-elements.timelineScroll.scrollTop}px)`;
});

elements.timelineResizer.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  state.timelineResizeDrag = {
    startY: event.clientY,
    startHeight: document.querySelector(".timeline-panel").getBoundingClientRect().height,
  };
  elements.timelineResizer.classList.add("dragging");
});

document.addEventListener("keydown", (event) => {
  const tag = event.target.tagName;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;

  const command = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (command && key === "s") {
    event.preventDefault();
    saveProject();
  } else if (command && key === "e") {
    event.preventDefault();
    prepareExportDialog();
  } else if (command && key === "n") {
    event.preventDefault();
    newProject();
  } else if (command && key === "z" && event.shiftKey) {
    event.preventDefault();
    redoEdit();
  } else if (command && key === "z") {
    event.preventDefault();
    undoEdit();
  } else if (command && key === "y") {
    event.preventDefault();
    redoEdit();
  } else if (command && key === "c") {
    event.preventDefault();
    copySelectedClip();
  } else if (command && key === "v") {
    event.preventDefault();
    pasteClipboardClip();
  } else if (command && event.shiftKey && key === "o") {
    event.preventDefault();
    openProject();
  } else if (!command && event.shiftKey && key === "z") {
    event.preventDefault();
    fitTimelineToArea();
  } else if (!command && event.code === "Space") {
    event.preventDefault();
    state.selectedClipId = null;
    renderTimeline();
    renderComposition();
    togglePlayback();
  } else if (!command && event.key === "ArrowRight") {
    event.preventDefault();
    stepPlayheadFrames(event.shiftKey ? 10 : 1);
  } else if (!command && event.key === "ArrowLeft") {
    event.preventDefault();
    stepPlayheadFrames(event.shiftKey ? -10 : -1);
  } else if (!command && key === "q") {
    event.preventDefault();
    state.timelineSnapEnabled = !state.timelineSnapEnabled;
    showStatus(`Timeline magnet: ${state.timelineSnapEnabled ? "on" : "off"}`);
  } else if (key === "s") {
    event.preventDefault();
    splitAtPlayhead();
  } else if (event.key === "Delete") {
    event.preventDefault();
    deleteSelectedClip();
  }
});

window.addEventListener("resize", () => {
  renderTimeline();
  updateCanvasSurface();
});
state.history = History.create(captureEditingState());
updateEditControls();
requestAnimationFrame(() => {
  renderTimeline();
  updateCanvasSurface();
});
