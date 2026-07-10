"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { inspectMp4, readMp4TrackSamples } = require("../src/mp4");
const { runProcess } = require("../src/process");
const { sanitizeFile } = require("../src/sanitize");
const { verifyFile } = require("../src/verify");

const tempRoot = path.join(process.cwd(), ".tmp-phase12-tests");
const sourceFile = path.join(tempRoot, "source.mp4");
const cleanFile = path.join(tempRoot, "anonymous.mp4");

function writeVariableUInt(buffer, offset, byteLength, value) {
  let remaining = value;
  for (let index = byteLength - 1; index >= 0; index -= 1) {
    buffer[offset + index] = remaining & 0xff;
    remaining = Math.floor(remaining / 256);
  }
}

function makeUserDataSeiNal(nalLengthSize) {
  const uuid = Buffer.from("00112233445566778899aabbccddeeff", "hex");
  const marker = Buffer.from("ANON_PHASE12_SEI", "ascii");
  const payloadSize = uuid.length + marker.length;
  const nal = Buffer.concat([
    Buffer.from([0x06, 0x05, payloadSize]),
    uuid,
    marker,
    Buffer.from([0x80]),
  ]);
  const packet = Buffer.alloc(nalLengthSize + nal.length);
  writeVariableUInt(packet, 0, nalLengthSize, nal.length);
  nal.copy(packet, nalLengthSize);
  return packet;
}

function updateChunkOffsets(buffer, trackInfos, insertionOffset, insertionLength) {
  for (const trackInfo of trackInfos) {
    const box = trackInfo.chunkOffsetBox;
    const entrySize = box.type === "co64" ? 8 : 4;
    const payloadOffset = box.payloadOffset + insertionLength;
    const entryCount = buffer.readUInt32BE(payloadOffset + 4);
    const entriesStart = payloadOffset + 8;

    for (let index = 0; index < entryCount; index += 1) {
      const entryOffset = entriesStart + index * entrySize;
      if (entrySize === 8) {
        const value = buffer.readBigUInt64BE(entryOffset);
        if (value > BigInt(insertionOffset)) {
          buffer.writeBigUInt64BE(value + BigInt(insertionLength), entryOffset);
        }
      } else {
        const value = buffer.readUInt32BE(entryOffset);
        if (value > insertionOffset) {
          buffer.writeUInt32BE(value + insertionLength, entryOffset);
        }
      }
    }
  }
}

function insertSeiIntoFirstVideoSample(inputPath, outputPath) {
  const original = fs.readFileSync(inputPath);
  const mp4 = inspectMp4(inputPath);
  const trackInfos = readMp4TrackSamples(mp4);
  const videoTrack = trackInfos.find((trackInfo) => trackInfo.type === "avc1");
  assert.ok(videoTrack);
  assert.ok(videoTrack.samples.length > 0);

  const firstSample = videoTrack.samples[0];
  const sei = makeUserDataSeiNal(videoTrack.nalLengthSize);
  const insertionOffset = firstSample.offset;
  const tampered = Buffer.concat([
    original.subarray(0, insertionOffset),
    sei,
    original.subarray(insertionOffset),
  ]);

  const mdat = mp4.boxes.find((box) => box.type === "mdat" && box.parentOffset === null);
  tampered.writeUInt32BE(mdat.size + sei.length, mdat.offset);

  const stszPayloadOffset = videoTrack.stsz.payloadOffset + sei.length;
  const defaultSampleSize = tampered.readUInt32BE(stszPayloadOffset + 4);
  assert.equal(defaultSampleSize, 0);
  const firstSampleSizeOffset = stszPayloadOffset + 12;
  tampered.writeUInt32BE(firstSample.size + sei.length, firstSampleSizeOffset);
  updateChunkOffsets(tampered, trackInfos, insertionOffset, sei.length);
  fs.writeFileSync(outputPath, tampered);
}

function addAdtsHeaderToFirstAudioSample(inputPath, outputPath) {
  const tampered = fs.readFileSync(inputPath);
  const mp4 = inspectMp4(inputPath);
  const audioTrack = readMp4TrackSamples(mp4).find((trackInfo) => trackInfo.type === "mp4a");
  assert.ok(audioTrack);
  assert.ok(audioTrack.samples.length > 0);

  const firstSample = audioTrack.samples[0];
  assert.ok(firstSample.size >= 2);
  tampered[firstSample.offset] = 0xff;
  tampered[firstSample.offset + 1] = 0xf1;
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
    "sine=frequency=880:sample_rate=44100:duration=1",
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

test("strict bitstream verifier accepts sanitized H.264 and AAC samples", async () => {
  const result = await verifyFile(cleanFile);
  assert.equal(result.ok, true);
  assert.equal(result.issues.length, 0);
});

test("strict bitstream verifier rejects H.264 SEI user data in mdat", async () => {
  const tamperedFile = path.join(tempRoot, "sei-tampered.mp4");
  insertSeiIntoFirstVideoSample(cleanFile, tamperedFile);

  const result = await verifyFile(tamperedFile);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => /forbidden SEI NAL/i.test(issue)));
});

test("strict bitstream verifier rejects ADTS data inside MP4 AAC samples", async () => {
  const tamperedFile = path.join(tempRoot, "adts-tampered.mp4");
  addAdtsHeaderToFirstAudioSample(cleanFile, tamperedFile);

  const result = await verifyFile(tamperedFile);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => /ADTS header/i.test(issue)));
});
