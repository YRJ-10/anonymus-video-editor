"use strict";

const Timeline = window.TimelineModel;

const elements = {
  addMedia: document.querySelector("#add-media"),
  addToTimeline: document.querySelector("#add-to-timeline"),
  assetCount: document.querySelector("#asset-count"),
  assetList: document.querySelector("#asset-list"),
  emptyAssets: document.querySelector("#empty-assets"),
  selectedName: document.querySelector("#selected-name"),
  viewport: document.querySelector("#preview-viewport"),
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
  trackLane: document.querySelector("#track-lane"),
  timelineEmpty: document.querySelector("#timeline-empty"),
  playhead: document.querySelector("#playhead"),
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
  selectedClipId: null,
  playhead: 0,
  pixelsPerSecond: 90,
  timelineDrag: null,
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

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
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
  const media = activeMediaElement();
  if (media) {
    media.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  }
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
      asset.type === "video"
        ? Number.isFinite(asset.duration)
          ? `${formatTime(asset.duration)} video`
          : "Loading video…"
        : "5 second photo";
    copy.append(name, type);

    button.append(icon, copy);
    button.addEventListener("click", () => {
      state.selectedClipId = null;
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
  const { keepView = false } = options;
  const alreadyLoaded = state.loadedAssetPath === asset.path;

  state.selectedPath = asset.path;
  elements.selectedName.textContent = asset.name;
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
  }

  if (!keepView) resetView();
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
    if (!asset) {
      asset = {
        ...picked,
        duration: picked.type === "image" ? 5 : null,
      };
      state.assets.push(asset);
    }

    state.selectedClipId = null;
    selectAsset(asset);
    renderTimeline();
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
  });
  state.clips = Timeline.appendClip(state.clips, clip);
  state.selectedClipId = clip.id;
  state.playhead = state.clips.find((candidate) => candidate.id === clip.id).start;
  renderTimeline();
  ensurePlayheadVisible();
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
  elements.timelineTimecode.textContent = formatTimelineTime(state.playhead);
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

function renderClips() {
  for (const existing of elements.trackLane.querySelectorAll(".timeline-clip")) {
    existing.remove();
  }

  elements.timelineEmpty.classList.toggle("hidden", state.clips.length > 0);

  for (const clip of state.clips) {
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
    elements.trackLane.append(element);
  }
}

function renderTimeline() {
  const visibleWidth = elements.timelineScroll.clientWidth || 800;
  const end = Math.max(15, Timeline.timelineEnd(state.clips) + 5);
  const width = Math.max(visibleWidth, Math.ceil(end * state.pixelsPerSecond));
  elements.timelineContent.style.width = `${width}px`;
  elements.trackLane.style.backgroundSize = `${state.pixelsPerSecond}px 100%`;
  renderRuler(width / state.pixelsPerSecond);
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
  state.playhead = clamp(timelineTime, clip.start, Timeline.clipEnd(clip));
  const asset = assetForClip(clip);
  if (!asset) return;

  if (asset.type === "video") {
    state.pendingVideoSeek = clip.sourceIn + (state.playhead - clip.start);
  }
  selectAsset(asset, { keepView: true });
  applyPendingVideoSeek();
}

function setPlayhead(time, syncPreview = true) {
  const maximum = Math.max(Timeline.timelineEnd(state.clips), 0);
  state.playhead = clamp(time, 0, maximum);
  const clip = Timeline.findClipAt(state.clips, state.playhead);

  if (syncPreview && clip) selectClipAtTime(clip, state.playhead);
  else if (!clip) {
    state.selectedClipId = null;
    elements.video.pause();
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
}

function deleteSelectedClip() {
  if (!state.selectedClipId) return;
  state.clips = Timeline.deleteClip(state.clips, state.selectedClipId);
  state.selectedClipId = null;
  state.playhead = Math.min(state.playhead, Timeline.timelineEnd(state.clips));
  elements.video.pause();
  renderTimeline();
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
    state.clips = Timeline.moveClip(
      drag.baseClips,
      drag.clipId,
      drag.baseClip.start + delta,
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
}

function endTimelineDrag() {
  if (!state.timelineDrag) return;
  state.timelineDrag = null;
  renderTimeline();
}

elements.addMedia.addEventListener("click", addMedia);
elements.addToTimeline.addEventListener("click", addSelectedAssetToTimeline);
window.anonEditor.onPickRequested(addMedia);

elements.video.addEventListener("loadedmetadata", () => {
  const asset = selectedAsset();
  if (asset?.type === "video") asset.duration = elements.video.duration;
  elements.seek.max = String(elements.video.duration || 0);
  applyPendingVideoSeek();
  updatePlayback();
  updateAddToTimelineButton();
  renderAssets();
});

elements.video.addEventListener("timeupdate", () => {
  updatePlayback();
  const clip = selectedClip();
  if (!clip || clip.assetPath !== state.loadedAssetPath) return;

  if (elements.video.currentTime >= clip.sourceOut - 0.02) {
    elements.video.pause();
    state.playhead = Timeline.clipEnd(clip);
  } else if (elements.video.currentTime >= clip.sourceIn) {
    state.playhead = clip.start + (elements.video.currentTime - clip.sourceIn);
  }
  updatePlayheadVisual();
  ensurePlayheadVisible();
});

elements.video.addEventListener("play", updatePlayback);
elements.video.addEventListener("pause", updatePlayback);
elements.video.addEventListener("ended", updatePlayback);

elements.play.addEventListener("click", async () => {
  const clip = selectedClip();
  if (clip && elements.video.currentTime >= clip.sourceOut - 0.02) {
    elements.video.currentTime = clip.sourceIn;
    state.playhead = clip.start;
  }

  if (elements.video.paused) await elements.video.play();
  else elements.video.pause();
});

elements.seek.addEventListener("input", () => {
  const clip = selectedClip();
  let time = Number(elements.seek.value);
  if (clip) time = clamp(time, clip.sourceIn, clip.sourceOut);
  elements.video.currentTime = time;
  if (clip) state.playhead = clip.start + (time - clip.sourceIn);
  updatePlayback();
  updatePlayheadVisual();
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
  state.timelineDrag = { mode: "playhead" };
  setPlayhead(timelineTimeFromPointer(event));
});

elements.trackLane.addEventListener("pointerdown", (event) => {
  if (event.target !== elements.trackLane || event.button !== 0) return;
  state.timelineDrag = { mode: "playhead" };
  setPlayhead(timelineTimeFromPointer(event));
});

elements.playhead.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  state.timelineDrag = { mode: "playhead" };
});

document.addEventListener("pointermove", handleTimelinePointerMove);
document.addEventListener("pointerup", endTimelineDrag);
document.addEventListener("pointercancel", endTimelineDrag);

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

document.addEventListener("keydown", (event) => {
  const tag = event.target.tagName;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;

  if (event.key.toLowerCase() === "s") {
    event.preventDefault();
    splitAtPlayhead();
  } else if (event.key === "Delete") {
    event.preventDefault();
    deleteSelectedClip();
  }
});

window.addEventListener("resize", renderTimeline);
requestAnimationFrame(renderTimeline);
