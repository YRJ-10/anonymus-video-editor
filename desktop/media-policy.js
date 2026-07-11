"use strict";

const path = require("node:path");

const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".m4v",
  ".mov",
  ".mkv",
  ".avi",
  ".webm",
  ".wmv",
  ".flv",
  ".mts",
  ".m2ts",
]);

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".bmp",
  ".gif",
  ".tif",
  ".tiff",
]);

const AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".flac",
  ".ogg",
]);

function classifyMediaFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (AUDIO_EXTENSIONS.has(extension)) return "audio";
  return null;
}

function shouldBlockRequest(url) {
  try {
    const protocol = new URL(url).protocol;
    return ["http:", "https:", "ws:", "wss:", "ftp:"].includes(protocol);
  } catch {
    return true;
  }
}

function displayDimensions(stream) {
  let width = Number(stream?.width) || 0;
  let height = Number(stream?.height) || 0;
  const sideRotation = (stream?.side_data_list || []).find((entry) =>
    Number.isFinite(Number(entry.rotation)),
  )?.rotation;
  const rotation = Number(sideRotation ?? stream?.tags?.rotate ?? 0);
  const normalizedRotation = ((rotation % 360) + 360) % 360;
  if (normalizedRotation === 90 || normalizedRotation === 270) {
    [width, height] = [height, width];
  }
  return { width, height };
}

module.exports = {
  AUDIO_EXTENSIONS,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  classifyMediaFile,
  displayDimensions,
  shouldBlockRequest,
};
