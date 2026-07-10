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
  "dref",
  "stsd",
  "avc1",
  "mp4a",
]);

const ALLOWED_CHILDREN = Object.freeze({
  "": new Set(["ftyp", "free", "mdat", "moov"]),
  moov: new Set(["mvhd", "trak"]),
  trak: new Set(["tkhd", "edts", "mdia"]),
  edts: new Set(["elst"]),
  mdia: new Set(["mdhd", "hdlr", "minf"]),
  minf: new Set(["vmhd", "smhd", "dinf", "stbl"]),
  dinf: new Set(["dref"]),
  dref: new Set(["url "]),
  stbl: new Set([
    "stsd",
    "stts",
    "stss",
    "ctts",
    "stsc",
    "stsz",
    "stco",
    "co64",
    "sgpd",
    "sbgp",
  ]),
  stsd: new Set(["avc1", "mp4a"]),
  avc1: new Set(["avcC", "colr", "pasp", "btrt"]),
  mp4a: new Set(["esds", "btrt"]),
});

function childPayloadOffset(box) {
  if (box.type === "meta") return box.payloadOffset + 4;
  if (box.type === "dref" || box.type === "stsd") return box.payloadOffset + 8;
  if (box.type === "avc1") return box.payloadOffset + 78;
  if (box.type === "mp4a") return box.payloadOffset + 28;
  return box.payloadOffset;
}

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

function parseBoxes(
  buffer,
  start = 0,
  end = buffer.length,
  parentPath = "",
  parentOffset = null,
  parentType = "",
) {
  const boxes = [];
  let offset = start;

  while (offset + 8 <= end) {
    const box = readBoxHeader(buffer, offset, end);
    if (!box) break;

    box.parentPath = parentPath;
    box.parentOffset = parentOffset;
    box.parentType = parentType;
    box.path = parentPath ? `${parentPath}.${box.type}` : box.type;
    boxes.push(box);

    if (CONTAINER_BOXES.has(box.type)) {
      const childStart = childPayloadOffset(box);
      if (childStart > box.offset + box.size) {
        throw new Error(`Invalid ${box.type} payload at byte ${box.offset}`);
      }
      boxes.push(
        ...parseBoxes(
          buffer,
          childStart,
          box.offset + box.size,
          box.path,
          box.offset,
          box.type,
        ),
      );
    }

    offset += box.size;
  }

  if (offset !== end) {
    throw new Error(`${end - offset} unparsed byte(s) begin at byte ${offset}`);
  }

  return boxes;
}

function directChildren(boxes, parent = null) {
  const parentOffset = parent?.offset ?? null;
  return boxes.filter((box) => box.parentOffset === parentOffset);
}

function requireCount(issues, boxes, parent, type, minimum, maximum = minimum) {
  const count = directChildren(boxes, parent).filter((box) => box.type === type).length;
  if (count < minimum || count > maximum) {
    const scope = parent?.path || "root";
    const expected = minimum === maximum ? String(minimum) : `${minimum}-${maximum}`;
    issues.push(`${scope} must contain ${expected} ${type} box(es), found ${count}`);
  }
}

function validateMp4Structure(mp4) {
  const issues = [];
  const { boxes, buffer } = mp4;

  for (const box of boxes) {
    const allowed = ALLOWED_CHILDREN[box.parentType];
    if (!allowed || !allowed.has(box.type)) {
      issues.push(`MP4 box is not allowlisted at ${box.path}`);
    }
  }

  const parents = [null, ...boxes.filter((box) => CONTAINER_BOXES.has(box.type))];
  for (const parent of parents) {
    const counts = new Map();
    for (const child of directChildren(boxes, parent)) {
      counts.set(child.type, (counts.get(child.type) || 0) + 1);
    }
    for (const [type, count] of counts) {
      const trackException = parent?.type === "moov" && type === "trak";
      if (count > 1 && !trackException) {
        issues.push(`${parent?.path || "root"} contains duplicate ${type} boxes`);
      }
    }
  }

  requireCount(issues, boxes, null, "ftyp", 1);
  requireCount(issues, boxes, null, "free", 1);
  requireCount(issues, boxes, null, "mdat", 1);
  requireCount(issues, boxes, null, "moov", 1);
  const topLevel = directChildren(boxes);
  if (topLevel.map((box) => box.type).join(",") !== "ftyp,free,mdat,moov") {
    issues.push("top-level MP4 boxes must be ordered ftyp,free,mdat,moov");
  }
  const free = topLevel.find((box) => box.type === "free");
  if (free && free.size !== 8) issues.push("free box must be an empty 8-byte box");

  const moov = topLevel.find((box) => box.type === "moov");
  requireCount(issues, boxes, moov, "mvhd", 1);
  requireCount(issues, boxes, moov, "trak", 1, 2);
  for (const track of directChildren(boxes, moov).filter((box) => box.type === "trak")) {
    requireCount(issues, boxes, track, "tkhd", 1);
    requireCount(issues, boxes, track, "edts", 1);
    requireCount(issues, boxes, track, "mdia", 1);
    const edts = directChildren(boxes, track).find((box) => box.type === "edts");
    const mdia = directChildren(boxes, track).find((box) => box.type === "mdia");
    requireCount(issues, boxes, edts, "elst", 1);
    requireCount(issues, boxes, mdia, "mdhd", 1);
    requireCount(issues, boxes, mdia, "hdlr", 1);
    requireCount(issues, boxes, mdia, "minf", 1);

    const minf = directChildren(boxes, mdia).find((box) => box.type === "minf");
    const mediaHeaders = directChildren(boxes, minf).filter((box) =>
      ["vmhd", "smhd"].includes(box.type),
    );
    if (mediaHeaders.length !== 1) {
      issues.push(`${minf?.path || track.path} must contain exactly one normalized media header`);
    }
    requireCount(issues, boxes, minf, "dinf", 1);
    requireCount(issues, boxes, minf, "stbl", 1);
    const dinf = directChildren(boxes, minf).find((box) => box.type === "dinf");
    const stbl = directChildren(boxes, minf).find((box) => box.type === "stbl");
    requireCount(issues, boxes, dinf, "dref", 1);
    const dref = directChildren(boxes, dinf).find((box) => box.type === "dref");
    requireCount(issues, boxes, dref, "url ", 1);

    for (const required of ["stsd", "stts", "stsc", "stsz"]) {
      requireCount(issues, boxes, stbl, required, 1);
    }
    const chunkOffsets = directChildren(boxes, stbl).filter((box) =>
      ["stco", "co64"].includes(box.type),
    );
    if (chunkOffsets.length !== 1) {
      issues.push(`${stbl?.path || track.path} must contain exactly one stco or co64 box`);
    }

    const stsd = directChildren(boxes, stbl).find((box) => box.type === "stsd");
    const sampleEntry = directChildren(boxes, stsd)[0];
    const actualOrder = directChildren(boxes, stbl).map((box) => box.type);
    const offsetType = chunkOffsets[0]?.type || "stco";
    const expectedOrder =
      sampleEntry?.type === "mp4a"
        ? ["stsd", "stts", "stsc", "stsz", offsetType, "sgpd", "sbgp"]
        : ["stsd", "stts", "stss", "ctts", "stsc", "stsz", offsetType];
    if (actualOrder.join(",") !== expectedOrder.join(",")) {
      issues.push(`${stbl?.path || track.path} has a non-normalized box order`);
    }
  }

  const videoEntries = boxes.filter((box) => box.type === "avc1");
  const audioEntries = boxes.filter((box) => box.type === "mp4a");
  if (videoEntries.length !== 1) {
    issues.push(`MP4 must contain exactly one avc1 sample entry, found ${videoEntries.length}`);
  }
  if (audioEntries.length > 1) {
    issues.push(`MP4 may contain at most one mp4a sample entry, found ${audioEntries.length}`);
  }
  const videoEntry = videoEntries[0];
  for (const required of ["avcC", "colr", "pasp", "btrt"]) {
    requireCount(issues, boxes, videoEntry, required, 1);
  }
  if (audioEntries.length === 1) {
    requireCount(issues, boxes, audioEntries[0], "esds", 1);
    requireCount(issues, boxes, audioEntries[0], "btrt", 1);
  }

  const finalTopLevelBox = topLevel.at(-1);
  if (!finalTopLevelBox || finalTopLevelBox.offset + finalTopLevelBox.size !== buffer.length) {
    issues.push("top-level MP4 boxes do not cover the complete file");
  }
  return issues;
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

module.exports = {
  inspectMp4,
  parseBoxes,
  removeMoovMetadataBoxes,
  validateMp4Structure,
};
