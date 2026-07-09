"use strict";

const Timeline = window.TimelineModel;
const History = window.EditorHistory;

const elements = {
  openProject: document.querySelector("#open-project"),
  saveProject: document.querySelector("#save-project"),
  undo: document.querySelector("#undo"),
  redo: document.querySelector("#redo"),
  copyClip: document.querySelector("#copy-clip"),
  pasteClip: document.querySelector("#paste-clip"),
  projectName: document.querySelector("#project-name"),
  appStatus: document.querySelector("#app-status"),
  addMedia: document.querySelector("#add-media"),
  addToTimeline: document.querySelector("#add-to-timeline"),
  addText: document.querySelector("#add-text"),
  editText: document.querySelector("#edit-text"),
  addTrack: document.querySelector("#add-track"),
  assetCount: document.querySelector("#asset-count"),
  assetList: document.querySelector("#asset-list"),
  emptyAssets: document.querySelector("#empty-assets"),
  selectedName: document.querySelector("#selected-name"),
  viewport: document.querySelector("#preview-viewport"),
  compositionSurface: document.querySelector("#composition-surface"),
  overlayStage: document.querySelector("#overlay-stage"),
  previewEmpty: document.querySelector("#preview-empty"),
  video: document.querySelector("#video-preview"),
  image: document.querySelector("#image-preview"),
  play: document.querySelector("#play-toggle"),
  seek: document.querySelector("#seek"),
  currentTime: document.querySelector("#current-time"),
  duration: document.querySelector("#duration"),
  zoomOut: document.querySelector("#zoom-out"),
  zoomFit: document.querySelector("#zoom-fit"),
  zoomIn: document.querySelector("#zoom-in"),
  zoomValue: document.querySelector("#zoom-value"),
  splitClip: document.querySelector("#split-clip"),
  deleteClip: document.querySelector("#delete-clip"),
  timelineZoom: document.querySelector("#timeline-zoom"),
  timelineTimecode: document.querySelector("#timeline-timecode"),
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
  tracks: [{ id: "v1", name: "V1" }],
  activeTrackId: "v1",
  selectedClipId: null,
  playhead: 0,
  pixelsPerSecond: 90,
  timelineDrag: null,
  timelinePreview: false,
  baseClipId: null,
  compositionSignature: "",
  textDialogMode: "add",
  textDrag: null,
  history: null,
  clipboard: null,
  statusTimer: null,
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

function clipsAtPlayhead() {
  return Timeline.findClipsAt(state.clips, state.playhead).sort(
    (a, b) => trackOrder(a.trackId) - trackOrder(b.trackId),
  );
}

function topClipAtPlayhead() {
  return clipsAtPlayhead().at(-1) || null;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
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
  };
}

function updateEditControls() {
  elements.undo.disabled = !state.history || !History.canUndo(state.history);
  elements.redo.disabled = !state.history || !History.canRedo(state.history);
  elements.copyClip.disabled = !selectedClip();
  elements.pasteClip.disabled = !state.clipboard;
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
  state.loadedAssetPath = null;
  state.baseClipId = null;
  state.compositionSignature = "";
  state.pendingVideoSeek = null;
  elements.video.removeAttribute("src");
  elements.image.removeAttribute("src");
  elements.video.classList.remove("visible");
  elements.image.classList.remove("visible");
  elements.overlayStage.replaceChildren();
  elements.timelineZoom.value = String(state.pixelsPerSecond);

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
  return {
    format: "anon-editor-project",
    version: 1,
    assets: state.assets.map(({ path, name, type, duration }) => ({
      path,
      name,
      type,
      duration,
    })),
    tracks: structuredClone(state.tracks),
    clips: structuredClone(state.clips),
    activeTrackId: state.activeTrackId,
    playhead: state.playhead,
    pixelsPerSecond: state.pixelsPerSecond,
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
    state.clipboard.type !== "text" &&
    !state.assets.some((asset) => asset.path === state.clipboard.assetPath)
  ) {
    showStatus("The copied clip's media is not available", true);
    return;
  }

  const clip = {
    ...structuredClone(state.clipboard),
    id: crypto.randomUUID(),
    trackId: state.activeTrackId,
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
  elements.addToTimeline.disabled = !asset || !Number.isFinite(asset.duration);
  const track = state.tracks.find((candidate) => candidate.id === state.activeTrackId);
  elements.addToTimeline.textContent = `＋ Add to ${track?.name || "timeline"}`;
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

function updatePlayback() {
  elements.currentTime.textContent = formatTime(elements.video.currentTime);
  elements.duration.textContent = formatTime(elements.video.duration);
  elements.seek.value = String(elements.video.currentTime || 0);
  elements.play.textContent = elements.video.paused ? "▶" : "❚❚";
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
    const picked = await window.anonEditor.pickMedia();
    if (!picked) return;

    let asset = state.assets.find((item) => item.path === picked.path);
    let added = false;
    if (!asset) {
      asset = {
        ...picked,
        duration: picked.type === "image" ? 5 : null,
      };
      state.assets.push(asset);
      added = true;
    }

    state.selectedClipId = null;
    state.timelinePreview = false;
    selectAsset(asset);
    renderTimeline();
    if (added) commitEdit();
  } finally {
    elements.addMedia.disabled = false;
  }
}

function addSelectedAssetToTimeline() {
  const asset = selectedAsset();
  if (!asset || !Number.isFinite(asset.duration)) return;

  const clip = Timeline.createClip({
    id: crypto.randomUUID(),
    asset,
    trackId: state.activeTrackId,
  });
  state.clips = Timeline.appendClip(state.clips, clip);
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
  return 5;
}

function updateTimelineControls() {
  const clip = selectedClip();
  const canSplit =
    clip &&
    state.playhead > clip.start + Timeline.MIN_CLIP_DURATION &&
    state.playhead < Timeline.clipEnd(clip) - Timeline.MIN_CLIP_DURATION;
  elements.splitClip.disabled = !canSplit;
  elements.deleteClip.disabled = !clip;
  elements.editText.disabled = clip?.type !== "text";
  elements.timelineTimecode.textContent = formatTimelineTime(state.playhead);
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
  const number = state.tracks.length + 1;
  const track = { id: `v${number}`, name: `V${number}` };
  state.tracks.push(track);
  state.activeTrackId = track.id;
  renderTimeline();
  updateAddToTimelineButton();
  if (recordHistory) commitEdit();
  return track;
}

function renderTrackStructure() {
  elements.trackLabelList.replaceChildren();
  elements.trackLanes.replaceChildren();

  const visualTracks = [...state.tracks].reverse();
  for (const track of visualTracks) {
    const label = document.createElement("div");
    label.className = "track-label";
    label.classList.toggle("active", track.id === state.activeTrackId);
    label.dataset.trackId = track.id;
    const name = document.createElement("strong");
    name.textContent = track.name;
    const type = document.createElement("span");
    type.textContent = track.id === "v1" ? "Base" : "Overlay";
    label.append(name, type);
    label.addEventListener("click", () => {
      state.activeTrackId = track.id;
      renderTimeline();
      updateAddToTimelineButton();
    });
    elements.trackLabelList.append(label);

    const lane = document.createElement("div");
    lane.className = "track-lane";
    lane.classList.toggle("active", track.id === state.activeTrackId);
    lane.dataset.trackId = track.id;
    lane.style.backgroundSize = `${state.pixelsPerSecond}px 100%`;
    lane.addEventListener("pointerdown", (event) => {
      if (event.target !== lane || event.button !== 0) return;
      state.activeTrackId = track.id;
      state.timelinePreview = true;
      state.timelineDrag = { mode: "playhead" };
      setPlayhead(timelineTimeFromPointer(event));
      renderTimeline();
    });

    if (!state.clips.some((clip) => clip.trackId === track.id)) {
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

function setPlayhead(time, syncPreview = true) {
  const maximum = Math.max(Timeline.timelineEnd(state.clips), 0);
  state.playhead = clamp(time, 0, maximum);
  const selected = selectedClip();
  const selectedIsActive =
    selected &&
    state.playhead >= selected.start &&
    state.playhead < Timeline.clipEnd(selected);
  const clip = selectedIsActive ? selected : topClipAtPlayhead();

  if (syncPreview && clip) selectClipAtTime(clip, state.playhead);
  else if (!clip) {
    state.selectedClipId = null;
    elements.video.pause();
    renderComposition();
  }

  updatePlayheadVisual();
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
  if (!state.selectedClipId) return;
  state.clips = Timeline.deleteClip(state.clips, state.selectedClipId);
  state.selectedClipId = null;
  state.playhead = Math.min(state.playhead, Timeline.timelineEnd(state.clips));
  elements.video.pause();
  renderTimeline();
  renderComposition();
  commitEdit();
}

function handleTimelinePointerMove(event) {
  const drag = state.timelineDrag;
  if (!drag) return;

  if (drag.mode === "playhead") {
    setPlayhead(timelineTimeFromPointer(event));
    return;
  }

  const delta = (event.clientX - drag.startX) / state.pixelsPerSecond;
  if (drag.mode === "move") {
    const lane = document.elementFromPoint(event.clientX, event.clientY)?.closest(".track-lane");
    const targetTrackId = lane?.dataset.trackId || drag.baseClip.trackId;
    state.activeTrackId = targetTrackId;
    state.clips = Timeline.moveClip(
      drag.baseClips,
      drag.clipId,
      drag.baseClip.start + delta,
      targetTrackId,
    );
  } else if (drag.mode === "trim-left") {
    state.clips = Timeline.trimClipLeft(
      drag.baseClips,
      drag.clipId,
      drag.baseClip.start + delta,
    );
  } else if (drag.mode === "trim-right") {
    state.clips = Timeline.trimClipRight(
      drag.baseClips,
      drag.clipId,
      Timeline.clipEnd(drag.baseClip) + delta,
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
  return [...elements.overlayStage.querySelectorAll("video.composition-overlay")];
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

function renderComposition() {
  if (!state.timelinePreview) return;

  const activeClips = clipsAtPlayhead();
  const mediaClips = activeClips.filter((clip) => clip.type !== "text");
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

    if (clip.type === "text") {
      const text = document.createElement("div");
      text.className = "text-overlay";
      text.classList.toggle("selected", clip.id === state.selectedClipId);
      text.textContent = clip.text;
      text.style.left = `${clip.x}%`;
      text.style.top = `${clip.y}%`;
      text.style.color = clip.color;
      const previewHeight = elements.compositionSurface.clientHeight || 540;
      text.style.fontSize = `${Math.max(10, (clip.fontSize * previewHeight) / 1080)}px`;
      text.style.zIndex = String(zIndex);
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

    if (clip.id === baseClip?.id) continue;
    const asset = assetForClip(clip);
    if (!asset) continue;
    const layer = document.createElement(asset.type === "video" ? "video" : "img");
    layer.className = "composition-overlay";
    layer.dataset.clipId = clip.id;
    layer.style.zIndex = String(zIndex);
    layer.src = asset.url;

    if (asset.type === "video") {
      layer.muted = true;
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
}

function syncCompositionDuringPlayback() {
  if (!state.timelinePreview) return;
  const activeClips = clipsAtPlayhead();
  const mediaClips = activeClips.filter((clip) => clip.type !== "text");
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
    if (state.tracks.length === 1) addTrack(false);
    const clip = Timeline.createTextClip({
      id: crypto.randomUUID(),
      text,
      trackId: state.activeTrackId,
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

elements.addMedia.addEventListener("click", addMedia);
elements.addToTimeline.addEventListener("click", addSelectedAssetToTimeline);
elements.addTrack.addEventListener("click", addTrack);
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
window.anonEditor.onPickRequested(addMedia);
window.anonEditor.onOpenProjectRequested(openProject);
window.anonEditor.onSaveProjectRequested(saveProject);

elements.video.addEventListener("loadedmetadata", () => {
  const asset = state.assets.find((candidate) => candidate.path === state.loadedAssetPath);
  if (asset?.type === "video") asset.duration = elements.video.duration;
  elements.seek.max = String(elements.video.duration || 0);
  applyPendingVideoSeek();
  updatePlayback();
  updateAddToTimelineButton();
  renderAssets();
});

elements.video.addEventListener("timeupdate", () => {
  updatePlayback();
  const clip = state.timelinePreview
    ? state.clips.find((candidate) => candidate.id === state.baseClipId)
    : selectedClip();
  if (!clip || clip.assetPath !== state.loadedAssetPath) return;

  if (elements.video.currentTime >= clip.sourceOut - 0.02) {
    elements.video.pause();
    state.playhead = Timeline.clipEnd(clip);
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

elements.play.addEventListener("click", async () => {
  const clip = state.timelinePreview
    ? state.clips.find((candidate) => candidate.id === state.baseClipId)
    : selectedClip();
  if (clip && elements.video.currentTime >= clip.sourceOut - 0.02) {
    elements.video.currentTime = clip.sourceIn;
    state.playhead = clip.start;
  }

  if (elements.video.paused) await elements.video.play();
  else elements.video.pause();
});

elements.seek.addEventListener("input", () => {
  const clip = state.timelinePreview
    ? state.clips.find((candidate) => candidate.id === state.baseClipId)
    : selectedClip();
  let time = Number(elements.seek.value);
  if (clip) time = clamp(time, clip.sourceIn, clip.sourceOut);
  elements.video.currentTime = time;
  if (clip) state.playhead = clip.start + (time - clip.sourceIn);
  updatePlayback();
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
  state.timelinePreview = true;
  state.timelineDrag = { mode: "playhead" };
  setPlayhead(timelineTimeFromPointer(event));
});

elements.playhead.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  state.timelinePreview = true;
  state.timelineDrag = { mode: "playhead" };
});

document.addEventListener("pointermove", (event) => {
  handleTimelinePointerMove(event);
  updateTextPosition(event);
});
document.addEventListener("pointerup", () => {
  endTimelineDrag();
  const movedText = Boolean(state.textDrag);
  state.textDrag = null;
  if (movedText) commitEdit();
});
document.addEventListener("pointercancel", () => {
  endTimelineDrag();
  const movedText = Boolean(state.textDrag);
  state.textDrag = null;
  if (movedText) commitEdit();
});

elements.splitClip.addEventListener("click", splitAtPlayhead);
elements.deleteClip.addEventListener("click", deleteSelectedClip);

elements.timelineZoom.addEventListener("input", () => {
  const oldPixelsPerSecond = state.pixelsPerSecond;
  const centerTime =
    (elements.timelineScroll.scrollLeft + elements.timelineScroll.clientWidth / 2) /
    oldPixelsPerSecond;
  state.pixelsPerSecond = Number(elements.timelineZoom.value);
  renderTimeline();
  elements.timelineScroll.scrollLeft =
    centerTime * state.pixelsPerSecond - elements.timelineScroll.clientWidth / 2;
});

elements.timelineScroll.addEventListener("scroll", () => {
  elements.trackLabelList.style.transform =
    `translateY(${-elements.timelineScroll.scrollTop}px)`;
});

document.addEventListener("keydown", (event) => {
  const tag = event.target.tagName;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;

  const command = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (command && key === "s") {
    event.preventDefault();
    saveProject();
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
  } else if (key === "s") {
    event.preventDefault();
    splitAtPlayhead();
  } else if (event.key === "Delete") {
    event.preventDefault();
    deleteSelectedClip();
  }
});

window.addEventListener("resize", renderTimeline);
state.history = History.create(captureEditingState());
updateEditControls();
requestAnimationFrame(renderTimeline);
