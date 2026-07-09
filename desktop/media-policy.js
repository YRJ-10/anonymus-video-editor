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

function classifyMediaFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
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

module.exports = {
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  classifyMediaFile,
  shouldBlockRequest,
};
