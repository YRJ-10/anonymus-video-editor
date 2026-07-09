"use strict";

const PROJECT_FORMAT = "anon-editor-project";
const PROJECT_VERSION = 1;
const MAX_PROJECT_BYTES = 10 * 1024 * 1024;

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function cleanString(value, maximum = 4096) {
  return String(value || "").slice(0, maximum);
}

function normalizeProject(input) {
  if (!input || typeof input !== "object") throw new Error("Project must be an object");
  if (input.format !== PROJECT_FORMAT || input.version !== PROJECT_VERSION) {
    throw new Error("Unsupported Anon Editor project format");
  }

  if (!Array.isArray(input.assets) || input.assets.length > 10000) {
    throw new Error("Project assets are invalid");
  }
  if (!Array.isArray(input.tracks) || input.tracks.length < 1 || input.tracks.length > 100) {
    throw new Error("Project tracks are invalid");
  }
  if (!Array.isArray(input.clips) || input.clips.length > 100000) {
    throw new Error("Project clips are invalid");
  }

  const assets = input.assets.map((asset) => {
    const type = asset?.type;
    if (!["video", "image"].includes(type)) throw new Error("Unsupported asset type");
    const assetPath = cleanString(asset.path);
    if (!assetPath) throw new Error("Asset path cannot be empty");
    return {
      path: assetPath,
      name: cleanString(asset.name, 512),
      type,
      duration: asset.duration == null ? null : Math.max(0, finite(asset.duration)),
    };
  });

  const trackIds = new Set();
  const tracks = input.tracks.map((track, index) => {
    const id = cleanString(track?.id, 64);
    if (!id || trackIds.has(id)) throw new Error("Track ids must be unique");
    trackIds.add(id);
    return {
      id,
      name: cleanString(track.name, 64) || `V${index + 1}`,
    };
  });

  const assetPaths = new Set(assets.map((asset) => asset.path));
  const clipIds = new Set();
  const clips = input.clips.map((clip) => {
    const id = cleanString(clip?.id, 128);
    const type = clip?.type;
    const trackId = cleanString(clip?.trackId, 64);
    if (!id || clipIds.has(id)) throw new Error("Clip ids must be unique");
    if (!["video", "image", "text"].includes(type)) throw new Error("Unsupported clip type");
    if (!trackIds.has(trackId)) throw new Error("Clip references an unknown track");
    if (type !== "text" && !assetPaths.has(clip.assetPath)) {
      throw new Error("Clip references an unknown asset");
    }
    clipIds.add(id);

    const normalized = {
      id,
      assetPath: type === "text" ? null : cleanString(clip.assetPath),
      assetName: cleanString(clip.assetName, 512),
      type,
      trackId,
      start: Math.max(0, finite(clip.start)),
      sourceIn: Math.max(0, finite(clip.sourceIn)),
      sourceOut: Math.max(0, finite(clip.sourceOut)),
      assetDuration: Math.max(0, finite(clip.assetDuration)),
    };
    if (normalized.sourceOut <= normalized.sourceIn) {
      throw new Error("Clip source range is invalid");
    }

    if (type === "text") {
      normalized.text = cleanString(clip.text, 240);
      if (!normalized.text.trim()) throw new Error("Text clip cannot be empty");
      normalized.fontSize = Math.min(160, Math.max(12, finite(clip.fontSize, 48)));
      normalized.color = /^#[0-9a-f]{6}$/i.test(clip.color) ? clip.color : "#ffffff";
      normalized.x = Math.min(100, Math.max(0, finite(clip.x, 50)));
      normalized.y = Math.min(100, Math.max(0, finite(clip.y, 50)));
    }
    return normalized;
  });

  const activeTrackId = trackIds.has(input.activeTrackId)
    ? input.activeTrackId
    : tracks[0].id;

  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    assets,
    tracks,
    clips,
    activeTrackId,
    playhead: Math.max(0, finite(input.playhead)),
    pixelsPerSecond: Math.min(240, Math.max(40, finite(input.pixelsPerSecond, 90))),
  };
}

function serializeProject(project) {
  return `${JSON.stringify(normalizeProject(project), null, 2)}\n`;
}

function parseProject(text) {
  if (Buffer.byteLength(text, "utf8") > MAX_PROJECT_BYTES) {
    throw new Error("Project file exceeds the 10 MB limit");
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Project file is not valid JSON");
  }
  return normalizeProject(parsed);
}

module.exports = {
  MAX_PROJECT_BYTES,
  PROJECT_FORMAT,
  PROJECT_VERSION,
  normalizeProject,
  parseProject,
  serializeProject,
};
