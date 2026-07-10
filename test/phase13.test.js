"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { inspectMp4, readMp4TrackSamples } = require("../src/mp4");
const { runProcess } = require("../src/process");
const { validateRawFileAnonymity } = require("../src/raw-verify");
const { sanitizeFile } = require("../src/sanitize");
const { verifyFile } = require("../src/verify");

const tempRoot = path.join(process.cwd(), ".tmp-phase13-tests");
const sourceFile = path.join(tempRoot, "source.mp4");
const cleanFile = path.join(tempRoot, "anonymous.mp4");

function readVariableUInt(buffer, offset, byteLength) {
  let value = 0;
  for (let index = 0; index < byteLength; index += 1) {
    value = (value * 256) + buffer[offset + index];
  }
  return value;
}

function overwriteVideoPayload(inputPath, outputPath, marker) {
  const tampered = fs.readFileSync(inputPath);
  const mp4 = inspectMp4(inputPath);
  const videoTrack = readMp4TrackSamples(mp4).find((trackInfo) => trackInfo.type === "avc1");
  assert.ok(videoTrack);

  for (const sample of videoTrack.samples) {
    let cursor = sample.offset;
    const sampleEnd = sample.offset + sample.size;
    while (cursor + videoTrack.nalLengthSize < sampleEnd) {
      const nalSize = readVariableUInt(tampered, cursor, videoTrack.nalLengthSize);
      const nalStart = cursor + videoTrack.nalLengthSize;
      const payloadStart = nalStart + 1;
      if (nalSize > marker.length + 1 && payloadStart + marker.length <= sampleEnd) {
        marker.copy(tampered, payloadStart);
        fs.writeFileSync(outputPath, tampered);
        return;
      }
      cursor = nalStart + nalSize;
    }
  }

  throw new Error("No large enough H.264 payload was found for the tamper marker");
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
    "testsrc2=size=640x360:rate=30:duration=1",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=660:sample_rate=44100:duration=1",
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

test("independent raw verifier accepts a sanitized anonymous MP4", async () => {
  assert.deepEqual(validateRawFileAnonymity(cleanFile), []);
  const result = await verifyFile(cleanFile);
  assert.equal(result.ok, true);
});

test("independent raw verifier rejects ASCII origin markers hidden in media payload", async () => {
  const tamperedFile = path.join(tempRoot, "raw-ascii-tampered.mp4");
  overwriteVideoPayload(
    cleanFile,
    tamperedFile,
    Buffer.from("SOURCE_SECRET_PHASE13_CAMERA", "ascii"),
  );

  const result = await verifyFile(tamperedFile);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => /raw ASCII text.*source-secret/i.test(issue)));
});

test("independent raw verifier rejects UTF-16LE source paths hidden in media payload", async () => {
  const tamperedFile = path.join(tempRoot, "raw-utf16-tampered.mp4");
  overwriteVideoPayload(
    cleanFile,
    tamperedFile,
    Buffer.from("C:\\Users\\yeryi\\Videos\\source-camera.mp4", "utf16le"),
  );

  const result = await verifyFile(tamperedFile);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => /raw UTF-16LE text.*Windows user path/i.test(issue)));
});

test("independent raw verifier rejects forbidden MP4 box signatures by byte scan", () => {
  const syntheticFile = path.join(tempRoot, "synthetic-uuid.bin");
  const bytes = Buffer.alloc(16);
  bytes.writeUInt32BE(16, 0);
  bytes.write("uuid", 4, "latin1");
  fs.writeFileSync(syntheticFile, bytes);

  const issues = validateRawFileAnonymity(syntheticFile);
  assert.ok(issues.some((issue) => /forbidden MP4 box signature uuid/i.test(issue)));
});
