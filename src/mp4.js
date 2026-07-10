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

function requireBytes(buffer, offset, length, label) {
  if (offset < 0 || length < 0 || offset + length > buffer.length) {
    throw new Error(`${label} points outside the file`);
  }
}

function readVariableUInt(buffer, offset, byteLength) {
  let value = 0;
  for (let index = 0; index < byteLength; index += 1) {
    value = (value * 256) + buffer[offset + index];
  }
  return value;
}

function readSampleSizes(buffer, stsz) {
  const start = stsz.payloadOffset;
  const end = stsz.offset + stsz.size;
  requireBytes(buffer, start, 12, stsz.path);
  if (start + 12 > end) throw new Error(`${stsz.path} is too small`);

  const sampleSize = buffer.readUInt32BE(start + 4);
  const sampleCount = buffer.readUInt32BE(start + 8);
  if (sampleCount > 1_000_000) {
    throw new Error(`${stsz.path} declares too many samples`);
  }
  if (sampleSize !== 0) return Array(sampleCount).fill(sampleSize);

  const entriesStart = start + 12;
  requireBytes(buffer, entriesStart, sampleCount * 4, stsz.path);
  if (entriesStart + sampleCount * 4 > end) {
    throw new Error(`${stsz.path} sample table is truncated`);
  }

  const sizes = [];
  for (let index = 0; index < sampleCount; index += 1) {
    sizes.push(buffer.readUInt32BE(entriesStart + index * 4));
  }
  return sizes;
}

function readChunkOffsets(buffer, chunkOffsetBox) {
  const start = chunkOffsetBox.payloadOffset;
  const end = chunkOffsetBox.offset + chunkOffsetBox.size;
  requireBytes(buffer, start, 8, chunkOffsetBox.path);
  if (start + 8 > end) throw new Error(`${chunkOffsetBox.path} is too small`);

  const entryCount = buffer.readUInt32BE(start + 4);
  const entrySize = chunkOffsetBox.type === "co64" ? 8 : 4;
  const entriesStart = start + 8;
  requireBytes(buffer, entriesStart, entryCount * entrySize, chunkOffsetBox.path);
  if (entriesStart + entryCount * entrySize > end) {
    throw new Error(`${chunkOffsetBox.path} offset table is truncated`);
  }

  const offsets = [];
  for (let index = 0; index < entryCount; index += 1) {
    const offset = entriesStart + index * entrySize;
    offsets.push(
      entrySize === 8
        ? Number(buffer.readBigUInt64BE(offset))
        : buffer.readUInt32BE(offset),
    );
  }
  return offsets;
}

function readSampleToChunk(buffer, stsc) {
  const start = stsc.payloadOffset;
  const end = stsc.offset + stsc.size;
  requireBytes(buffer, start, 8, stsc.path);
  if (start + 8 > end) throw new Error(`${stsc.path} is too small`);

  const entryCount = buffer.readUInt32BE(start + 4);
  const entriesStart = start + 8;
  requireBytes(buffer, entriesStart, entryCount * 12, stsc.path);
  if (entriesStart + entryCount * 12 > end) {
    throw new Error(`${stsc.path} sample-to-chunk table is truncated`);
  }

  const entries = [];
  for (let index = 0; index < entryCount; index += 1) {
    const offset = entriesStart + index * 12;
    entries.push({
      firstChunk: buffer.readUInt32BE(offset),
      samplesPerChunk: buffer.readUInt32BE(offset + 4),
      sampleDescriptionIndex: buffer.readUInt32BE(offset + 8),
    });
  }
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry.firstChunk < 1 || entry.samplesPerChunk < 1) {
      throw new Error(`${stsc.path} contains an invalid sample-to-chunk entry`);
    }
    if (index > 0 && entry.firstChunk <= entries[index - 1].firstChunk) {
      throw new Error(`${stsc.path} sample-to-chunk entries are not ordered`);
    }
  }
  return entries;
}

function readAvcNalLengthSize(buffer, boxes, avc1) {
  const avcC = directChildren(boxes, avc1).find((box) => box.type === "avcC");
  if (!avcC) throw new Error(`${avc1.path} is missing avcC`);
  requireBytes(buffer, avcC.payloadOffset, 5, avcC.path);
  return (buffer[avcC.payloadOffset + 4] & 0x03) + 1;
}

function sampleEntryForTrack(boxes, track) {
  const mdia = directChildren(boxes, track).find((box) => box.type === "mdia");
  const minf = directChildren(boxes, mdia).find((box) => box.type === "minf");
  const stbl = directChildren(boxes, minf).find((box) => box.type === "stbl");
  const stsd = directChildren(boxes, stbl).find((box) => box.type === "stsd");
  const sampleEntry = directChildren(boxes, stsd).find((box) =>
    ["avc1", "mp4a"].includes(box.type),
  );
  return { mdia, minf, stbl, stsd, sampleEntry };
}

function readMp4TrackSamples(mp4) {
  const { boxes, buffer } = mp4;
  const moov = directChildren(boxes).find((box) => box.type === "moov");
  const tracks = directChildren(boxes, moov).filter((box) => box.type === "trak");

  return tracks.map((track) => {
    const { stbl, sampleEntry } = sampleEntryForTrack(boxes, track);
    if (!stbl || !sampleEntry) throw new Error(`${track.path} is missing a sample entry`);
    const stsz = directChildren(boxes, stbl).find((box) => box.type === "stsz");
    const stsc = directChildren(boxes, stbl).find((box) => box.type === "stsc");
    const chunkOffsetBox = directChildren(boxes, stbl).find((box) =>
      ["stco", "co64"].includes(box.type),
    );
    if (!stsz || !stsc || !chunkOffsetBox) {
      throw new Error(`${track.path} is missing required sample tables`);
    }

    const sampleSizes = readSampleSizes(buffer, stsz);
    const chunkOffsets = readChunkOffsets(buffer, chunkOffsetBox);
    const sampleToChunk = readSampleToChunk(buffer, stsc);
    const samples = [];
    let sampleIndex = 0;
    let stscIndex = 0;

    for (let chunkIndex = 1; chunkIndex <= chunkOffsets.length; chunkIndex += 1) {
      if (
        stscIndex + 1 < sampleToChunk.length &&
        chunkIndex >= sampleToChunk[stscIndex + 1].firstChunk
      ) {
        stscIndex += 1;
      }
      let sampleOffset = chunkOffsets[chunkIndex - 1];
      const { samplesPerChunk } = sampleToChunk[stscIndex];
      for (let index = 0; index < samplesPerChunk && sampleIndex < sampleSizes.length; index += 1) {
        const size = sampleSizes[sampleIndex];
        samples.push({
          index: sampleIndex,
          chunkIndex,
          offset: sampleOffset,
          size,
        });
        sampleOffset += size;
        sampleIndex += 1;
      }
    }

    if (sampleIndex !== sampleSizes.length) {
      throw new Error(`${track.path} sample tables do not account for every sample`);
    }

    return {
      track,
      type: sampleEntry.type,
      sampleEntry,
      stbl,
      stsz,
      stsc,
      chunkOffsetBox,
      chunkOffsets,
      samples,
      nalLengthSize: sampleEntry.type === "avc1"
        ? readAvcNalLengthSize(buffer, boxes, sampleEntry)
        : null,
    };
  });
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

function validateAvcTrackBitstream(issues, mp4, trackInfo) {
  const allowedNalTypes = new Set([1, 5, 7, 8, 9]);
  const { buffer } = mp4;
  let nalCount = 0;

  for (const sample of trackInfo.samples) {
    if (sample.size <= 0) {
      issues.push(`H.264 sample ${sample.index} is empty`);
      continue;
    }
    let cursor = sample.offset;
    const sampleEnd = sample.offset + sample.size;
    while (cursor < sampleEnd) {
      if (cursor + trackInfo.nalLengthSize > sampleEnd) {
        issues.push(`H.264 sample ${sample.index} has a truncated NAL length`);
        break;
      }
      const nalSize = readVariableUInt(buffer, cursor, trackInfo.nalLengthSize);
      cursor += trackInfo.nalLengthSize;
      if (nalSize <= 0) {
        issues.push(`H.264 sample ${sample.index} contains an empty NAL unit`);
        break;
      }
      if (cursor + nalSize > sampleEnd) {
        issues.push(`H.264 sample ${sample.index} has a NAL unit outside the sample`);
        break;
      }

      const nalType = buffer[cursor] & 0x1f;
      if (nalType === 6) {
        issues.push(`H.264 bitstream contains forbidden SEI NAL unit in sample ${sample.index}`);
      } else if (!allowedNalTypes.has(nalType)) {
        issues.push(
          `H.264 bitstream contains non-normalized NAL type ${nalType} in sample ${sample.index}`,
        );
      }
      nalCount += 1;
      cursor += nalSize;
    }
  }

  if (nalCount === 0) issues.push("H.264 bitstream contains no NAL units");
}

function validateAacTrackBitstream(issues, mp4, trackInfo) {
  const { buffer } = mp4;
  for (const sample of trackInfo.samples) {
    if (sample.size <= 0) {
      issues.push(`AAC sample ${sample.index} is empty`);
      continue;
    }
    if (
      sample.size >= 2 &&
      buffer[sample.offset] === 0xff &&
      (buffer[sample.offset + 1] & 0xf0) === 0xf0 &&
      (buffer[sample.offset + 1] & 0x06) === 0
    ) {
      issues.push(`AAC sample ${sample.index} contains an ADTS header`);
    }
    if (
      sample.size >= 3 &&
      buffer[sample.offset] === 0x49 &&
      buffer[sample.offset + 1] === 0x44 &&
      buffer[sample.offset + 2] === 0x33
    ) {
      issues.push(`AAC sample ${sample.index} contains an ID3 header`);
    }
  }
}

function validateMp4Bitstreams(mp4) {
  const issues = [];
  const { boxes, buffer } = mp4;
  const mdat = directChildren(boxes).find((box) => box.type === "mdat");
  let trackSamples;

  try {
    trackSamples = readMp4TrackSamples(mp4);
  } catch (error) {
    return [`MP4 sample table inspection failed: ${error.message}`];
  }

  for (const trackInfo of trackSamples) {
    for (const sample of trackInfo.samples) {
      if (
        !mdat ||
        sample.offset < mdat.payloadOffset ||
        sample.offset + sample.size > mdat.offset + mdat.size
      ) {
        issues.push(`${trackInfo.track.path} sample ${sample.index} points outside mdat`);
      }
    }

    if (trackInfo.type === "avc1") {
      validateAvcTrackBitstream(issues, mp4, trackInfo);
    } else if (trackInfo.type === "mp4a") {
      validateAacTrackBitstream(issues, mp4, trackInfo);
    } else {
      issues.push(`${trackInfo.track.path} has unsupported bitstream type ${trackInfo.type}`);
    }
  }

  if (!buffer.length) issues.push("MP4 file is empty");
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
  readMp4TrackSamples,
  removeMoovMetadataBoxes,
  validateMp4Bitstreams,
  validateMp4Structure,
};
