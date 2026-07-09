"use strict";

const elements = {
  addMedia: document.querySelector("#add-media"),
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
};

const state = {
  assets: [],
  selectedPath: null,
  zoom: 1,
  panX: 0,
  panY: 0,
  dragging: false,
  pointerX: 0,
  pointerY: 0,
};

function activeMediaElement() {
  if (elements.video.classList.contains("visible")) return elements.video;
  if (elements.image.classList.contains("visible")) return elements.image;
  return null;
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
    type.textContent = asset.type === "video" ? "Video" : "Photo";
    copy.append(name, type);

    button.append(icon, copy);
    button.addEventListener("click", () => selectAsset(asset));
    elements.assetList.append(button);
  }
}

function updatePlayback() {
  elements.currentTime.textContent = formatTime(elements.video.currentTime);
  elements.duration.textContent = formatTime(elements.video.duration);
  elements.seek.value = String(elements.video.currentTime || 0);
  elements.play.textContent = elements.video.paused ? "▶" : "❚❚";
}

function selectAsset(asset) {
  elements.video.pause();
  elements.video.removeAttribute("src");
  elements.image.removeAttribute("src");
  elements.video.classList.remove("visible");
  elements.image.classList.remove("visible");

  state.selectedPath = asset.path;
  elements.selectedName.textContent = asset.name;
  elements.previewEmpty.classList.add("hidden");

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

  resetView();
  renderAssets();
}

async function addMedia() {
  elements.addMedia.disabled = true;
  try {
    const asset = await window.anonEditor.pickMedia();
    if (!asset) return;

    const existing = state.assets.find((item) => item.path === asset.path);
    if (!existing) state.assets.push(asset);
    selectAsset(existing || asset);
  } finally {
    elements.addMedia.disabled = false;
  }
}

elements.addMedia.addEventListener("click", addMedia);
window.anonEditor.onPickRequested(addMedia);

elements.video.addEventListener("loadedmetadata", () => {
  elements.seek.max = String(elements.video.duration || 0);
  updatePlayback();
});
elements.video.addEventListener("timeupdate", updatePlayback);
elements.video.addEventListener("play", updatePlayback);
elements.video.addEventListener("pause", updatePlayback);
elements.video.addEventListener("ended", updatePlayback);

elements.play.addEventListener("click", async () => {
  if (elements.video.paused) await elements.video.play();
  else elements.video.pause();
});

elements.seek.addEventListener("input", () => {
  elements.video.currentTime = Number(elements.seek.value);
  updatePlayback();
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
  state.dragging = true;
  state.pointerX = event.clientX;
  state.pointerY = event.clientY;
  elements.viewport.classList.add("dragging");
  elements.viewport.setPointerCapture(event.pointerId);
});

elements.viewport.addEventListener("pointermove", (event) => {
  if (!state.dragging) return;
  state.panX += event.clientX - state.pointerX;
  state.panY += event.clientY - state.pointerY;
  state.pointerX = event.clientX;
  state.pointerY = event.clientY;
  applyTransform();
});

function endDrag(event) {
  if (!state.dragging) return;
  state.dragging = false;
  elements.viewport.classList.remove("dragging");
  if (elements.viewport.hasPointerCapture(event.pointerId)) {
    elements.viewport.releasePointerCapture(event.pointerId);
  }
}

elements.viewport.addEventListener("pointerup", endDrag);
elements.viewport.addEventListener("pointercancel", endDrag);
