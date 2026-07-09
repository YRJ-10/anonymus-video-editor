"use strict";

const fs = require("node:fs");

const CONTAINER_BOXES = new Set([
  "moov",
  "trak",
  "mdia",
  "minf",
  "dinf",
  "stbl",
  "edts",
  "udta",
  "meta",
  "ilst",
]);

function readBoxHeader(buffer, offset, end) {
  if (offset + 8 > end) return null;

  let size = buffer.readUInt32BE(offset);
  const type = buffer.toString("latin1", offset + 4, offset + 8);
  let headerSize = 8;

  if (size === 1) {
    if (offset + 16 > end) return null;
    const largeSize = buffer.readBigUInt64BE(offset + 8);
    if (largeSize > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`MP4 box ${type} is too large to inspect safely`);
    }
    size = Number(largeSize);
    headerSize = 16;
  } else if (size === 0) {
    size = end - offset;
  }

  if (size < headerSize || offset + size > end) {
    throw new Error(`Invalid MP4 box ${type} at byte ${offset}`);
  }

  return { offset, size, type, headerSize, payloadOffset: offset + headerSize };
}

function parseBoxes(buffer, start = 0, end = buffer.length, parentPath = "") {
  const boxes = [];
  let offset = start;

  while (offset + 8 <= end) {
    const box = readBoxHeader(buffer, offset, end);
    if (!box) break;

    box.path = parentPath ? `${parentPath}.${box.type}` : box.type;
    boxes.push(box);

    if (CONTAINER_BOXES.has(box.type)) {
      const childStart = box.payloadOffset + (box.type === "meta" ? 4 : 0);
      if (childStart <= box.offset + box.size) {
        boxes.push(...parseBoxes(buffer, childStart, box.offset + box.size, box.path));
      }
    }

    offset += box.size;
  }

  if (offset !== end && end - offset >= 8) {
    throw new Error(`Unparsed MP4 data begins at byte ${offset}`);
  }

  return boxes;
}

function readMediaHeaderTimes(buffer, box) {
  const start = box.payloadOffset;
  if (start + 12 > box.offset + box.size) return null;

  const version = buffer[start];
  if (version === 0) {
    return {
      creation: BigInt(buffer.readUInt32BE(start + 4)),
      modification: BigInt(buffer.readUInt32BE(start + 8)),
    };
  }

  if (version === 1 && start + 20 <= box.offset + box.size) {
    return {
      creation: buffer.readBigUInt64BE(start + 4),
      modification: buffer.readBigUInt64BE(start + 12),
    };
  }

  return null;
}

function inspectMp4(filePath) {
  const buffer = fs.readFileSync(filePath);
  const boxes = parseBoxes(buffer);
  const timestamps = boxes
    .filter((box) => ["mvhd", "tkhd", "mdhd"].includes(box.type))
    .map((box) => ({ path: box.path, ...readMediaHeaderTimes(buffer, box) }))
    .filter((entry) => entry.creation !== undefined);

  return { buffer, boxes, timestamps };
}

function removeMoovMetadataBoxes(filePath) {
  const buffer = fs.readFileSync(filePath);
  const topLevelBoxes = parseBoxes(buffer);
  const moov = topLevelBoxes.find((box) => box.type === "moov" && !box.path.includes("."));
  if (!moov) throw new Error("Cannot normalize MP4 without a moov box");
  if (moov.headerSize !== 8) throw new Error("64-bit moov boxes are not supported");

  const directChildren = parseBoxes(
    buffer,
    moov.payloadOffset,
    moov.offset + moov.size,
    "moov",
  ).filter((box) => box.path.split(".").length === 2);
  const removable = directChildren.filter((box) => box.type === "udta");
  if (removable.length === 0) return;

  const chunks = [];
  let cursor = 0;
  let removedBytes = 0;
  for (const box of removable.sort((a, b) => a.offset - b.offset)) {
    chunks.push(buffer.subarray(cursor, box.offset));
    cursor = box.offset + box.size;
    removedBytes += box.size;
  }
  chunks.push(buffer.subarray(cursor));

  const normalized = Buffer.concat(chunks);
  normalized.writeUInt32BE(moov.size - removedBytes, moov.offset);
  fs.writeFileSync(filePath, normalized);
}

module.exports = { inspectMp4, parseBoxes, removeMoovMetadataBoxes };
