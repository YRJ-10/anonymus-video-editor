"use strict";

const fs = require("node:fs");

const MAX_ISSUES_PER_PATTERN = 1;
const FORBIDDEN_METADATA_KEY_PATTERN =
  /\b(?:creation_time|encoded_by|encoder|artist|album|comment|copyright|description|title|location|gps(?:latitude|longitude)?|device[_ -]?model|camera[_ -]?model|software)\b/gi;
const STRONG_STANDALONE_METADATA_KEYS = new Set([
  "creation_time",
  "encoded_by",
  "gpslatitude",
  "gpslongitude",
  "device_model",
  "device-model",
  "device model",
  "camera_model",
  "camera-model",
  "camera model",
]);

const FORBIDDEN_RAW_PATTERNS = Object.freeze([
  { label: "source-secret marker", pattern: /SOURCE_SECRET/i },
  { label: "trace marker", pattern: /TRACE_ME/i },
  { label: "FFmpeg signature", pattern: /\bFFmpeg\b/i },
  { label: "Lavf muxer signature", pattern: /\bLavf\d/i },
  { label: "x264 encoder signature", pattern: /\bx264\b/i },
  { label: "QuickTime metadata namespace", pattern: /\b(?:com\.apple\.quicktime|QuickTime|iTun\w*)\b/i },
  { label: "Windows user path", pattern: /[A-Za-z]:\\(?:Users|Documents and Settings)\\/i },
  { label: "Unix user path", pattern: /\/(?:home|Users)\/[^/\s]+/i },
  { label: "URL", pattern: /\b(?:https?:\/\/|www\.)/i },
  { label: "email address", pattern: /\b[A-Z0-9._%+-]{3,}@[A-Z0-9.-]{3,}\.[A-Z]{3,}\b/i },
]);

const FORBIDDEN_RAW_BOX_TYPES = Object.freeze(["uuid", "udta", "meta", "ilst", "keys"]);

function isPrintableAscii(byte) {
  return byte >= 0x20 && byte <= 0x7e;
}

function clipped(value) {
  return value.length <= 80 ? value : `${value.slice(0, 77)}...`;
}

function extractAsciiRuns(buffer, minimumLength = 4) {
  const runs = [];
  let start = null;

  for (let offset = 0; offset <= buffer.length; offset += 1) {
    const printable = offset < buffer.length && isPrintableAscii(buffer[offset]);
    if (printable && start === null) start = offset;
    if ((!printable || offset === buffer.length) && start !== null) {
      if (offset - start >= minimumLength) {
        runs.push({
          encoding: "ASCII",
          offset: start,
          text: buffer.toString("latin1", start, offset),
        });
      }
      start = null;
    }
  }

  return runs;
}

function extractUtf16LeRuns(buffer, minimumLength = 4) {
  const runs = [];
  let offset = 0;

  while (offset + 1 < buffer.length) {
    const start = offset;
    let text = "";
    while (
      offset + 1 < buffer.length &&
      isPrintableAscii(buffer[offset]) &&
      buffer[offset + 1] === 0x00
    ) {
      text += String.fromCharCode(buffer[offset]);
      offset += 2;
    }

    if (text.length >= minimumLength) {
      runs.push({ encoding: "UTF-16LE", offset: start, text });
      continue;
    }
    offset = start + 1;
  }

  return runs;
}

function findPotentialBoxHeaders(buffer, type) {
  const matches = [];
  const signature = Buffer.from(type, "latin1");
  let offset = 4;

  while (offset < buffer.length) {
    const index = buffer.indexOf(signature, offset);
    if (index === -1) break;
    if (index >= 4) {
      const size = buffer.readUInt32BE(index - 4);
      const boxOffset = index - 4;
      if (size >= 8 && boxOffset + size <= buffer.length) {
        matches.push({ offset: boxOffset, size });
      }
    }
    offset = index + 1;
  }

  return matches;
}

function nextNonWhitespace(text, index) {
  for (let cursor = index; cursor < text.length; cursor += 1) {
    if (!/\s/.test(text[cursor])) return text[cursor];
  }
  return "";
}

function previousNonWhitespace(text, index) {
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    if (!/\s/.test(text[cursor])) return text[cursor];
  }
  return "";
}

function normalizeMetadataKey(key) {
  return String(key || "").toLowerCase();
}

function hasMetadataKeyContext(text, match) {
  const rawKey = match[0];
  const key = normalizeMetadataKey(rawKey);
  if (STRONG_STANDALONE_METADATA_KEYS.has(key)) return true;

  const before = previousNonWhitespace(text, match.index - 1);
  const after = nextNonWhitespace(text, match.index + rawKey.length);
  if ([":", "="].includes(after)) return true;
  if (["\"", "'", "{", "[", ",", ";"].includes(before) && [":", "="].includes(after)) {
    return true;
  }
  return false;
}

function findForbiddenMetadataKey(text) {
  FORBIDDEN_METADATA_KEY_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(FORBIDDEN_METADATA_KEY_PATTERN)) {
    if (hasMetadataKeyContext(text, match)) return match[0];
  }
  return null;
}

function validateRawFileAnonymity(filePath) {
  const buffer = fs.readFileSync(filePath);
  const issues = [];
  const runs = [...extractAsciiRuns(buffer), ...extractUtf16LeRuns(buffer)];

  for (const { label, pattern } of FORBIDDEN_RAW_PATTERNS) {
    let count = 0;
    for (const run of runs) {
      if (!pattern.test(run.text)) continue;
      issues.push(
        `raw ${run.encoding} text contains forbidden ${label} at byte ${run.offset}: ${JSON.stringify(clipped(run.text))}`,
      );
      count += 1;
      if (count >= MAX_ISSUES_PER_PATTERN) break;
    }
  }

  let metadataIssueCount = 0;
  for (const run of runs) {
    const key = findForbiddenMetadataKey(run.text);
    if (!key) continue;
    issues.push(
      `raw ${run.encoding} text contains forbidden metadata key ${JSON.stringify(key)} at byte ${run.offset}: ${JSON.stringify(clipped(run.text))}`,
    );
    metadataIssueCount += 1;
    if (metadataIssueCount >= MAX_ISSUES_PER_PATTERN) break;
  }

  for (const type of FORBIDDEN_RAW_BOX_TYPES) {
    for (const match of findPotentialBoxHeaders(buffer, type).slice(0, 1)) {
      issues.push(
        `raw file scan found forbidden MP4 box signature ${type} at byte ${match.offset}`,
      );
    }
  }

  return issues;
}

module.exports = {
  extractAsciiRuns,
  extractUtf16LeRuns,
  findForbiddenMetadataKey,
  validateRawFileAnonymity,
};
