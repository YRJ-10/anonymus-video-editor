"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { inspectMp4, readMp4TrackSamples } = require("../src/mp4");
const { runProcess } = require("../src/process");
const { sanitizeFile } = require("../src/sanitize");
const { verifyFile } = require("../src/verify");

const tempRoot = path.join(process.cwd(), ".tmp-phase14-tests");
const sourceFile = path.join(tempRoot, "source.mp4");
const cleanFile = path.join(tempRoot, "anonymous.mp4");

function patchChunkOffsets(buffer, trackInfos, insertedAt, insertedLength) {
  for (const trackInfo of trackInfos) {
    const box = trackInfo.chunkOffsetBox;
    const entrySize = box.type === "co64" ? 8 : 4;
    const payloadOffset = box.payloadOffset + insertedLength;
    const entryCount = buffer.readUInt32BE(payloadOffset + 4);
    const entriesStart = payloadOffset + 8;

    for (let index = 0; index < entryCount; index += 1) {
      const entryOffset = entriesStart + index * entrySize;
      if (entrySize === 8) {
        const value = buffer.readBigUInt64BE(entryOffset);
        if (value >= BigInt(insertedAt)) {
          buffer.writeBigUInt64BE(value + BigInt(insertedLength), entryOffset);
        }
      } else {
        const value = buffer.readUInt32BE(entryOffset);
        if (value >= insertedAt) {
          buffer.writeUInt32BE(value + insertedLength, entryOffset);
        }
      }
    }
  }
}

function insertUnreferencedMdatBytes(inputPath, outputPath) {
  const original = fs.readFileSync(inputPath);
  const mp4 = inspectMp4(inputPath);
  const mdat = mp4.boxes.find((box) => box.type === "mdat" && box.parentOffset === null);
  const trackInfos = readMp4TrackSamples(mp4);
  const inserted = Buffer.from([0x00, 0xff, 0x13, 0x37, 0x88, 0x42, 0x00, 0x99]);
  const insertionOffset = mdat.payloadOffset;
  const tampered = Buffer.concat([
    original.subarray(0, insertionOffset),
    inserted,
    original.subarray(insertionOffset),
  ]);

  tampered.writeUInt32BE(mdat.size + inserted.length, mdat.offset);
  patchChunkOffsets(tampered, trackInfos, insertionOffset, inserted.length);
  fs.writeFileSync(outputPath, tampered);
}

function overlapFirstAudioChunkWithVideo(inputPath, outputPath) {
  const tampered = fs.readFileSync(inputPath);
  const mp4 = inspectMp4(inputPath);
  const trackInfos = readMp4TrackSamples(mp4);
  const videoTrack = trackInfos.find((trackInfo) => trackInfo.type === "avc1");
  const audioTrack = trackInfos.find((trackInfo) => trackInfo.type === "mp4a");
  assert.ok(videoTrack);
  assert.ok(audioTrack);

  const box = audioTrack.chunkOffsetBox;
  const firstEntryOffset = box.payloadOffset + 8;
  if (box.type === "co64") {
    tampered.writeBigUInt64BE(BigInt(videoTrack.samples[0].offset), firstEntryOffset);
  } else {
    tampered.writeUInt32BE(videoTrack.samples[0].offset, firstEntryOffset);
  }
  fs.writeFileSync(outputPath, tampered);
}

test.before(async () => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.mkdirSync(tempRoot, { recursive: true });
  await runProcess("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=320x240:rate=30:duration=1",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=990:sample_rate=44100:duration=1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    sourceFile,
  ]);
  await sanitizeFile(sourceFile, cleanFile, { force: true });
});

test.after(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("adversarial hardening accepts a clean normalized MP4", async () => {
  const result = await verifyFile(cleanFile);
  assert.equal(result.ok, true);
});

test("adversarial hardening rejects hidden unreferenced bytes inside mdat", async () => {
  const tamperedFile = path.join(tempRoot, "hidden-mdat-payload.mp4");
  insertUnreferencedMdatBytes(cleanFile, tamperedFile);

  const result = await verifyFile(tamperedFile);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => /unreferenced mdat bytes/i.test(issue)));
});

test("adversarial hardening rejects overlapping media samples", async () => {
  const tamperedFile = path.join(tempRoot, "overlapping-samples.mp4");
  overlapFirstAudioChunkWithVideo(cleanFile, tamperedFile);

  const result = await verifyFile(tamperedFile);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => /mdat coverage overlap|overlaps/i.test(issue)));
});
