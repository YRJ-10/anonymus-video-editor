"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { inspectMp4 } = require("../src/mp4");
const { runProcess } = require("../src/process");
const { sanitizeFile } = require("../src/sanitize");
const { verifyFile } = require("../src/verify");

const tempRoot = path.join(process.cwd(), ".tmp-phase1-tests");
const poisonFile = path.join(tempRoot, "poison-source.mkv");
const cleanFile = path.join(tempRoot, "anonymous.mp4");

async function createPoisonFixture() {
  fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.mkdirSync(tempRoot, { recursive: true });

  const subtitle = path.join(tempRoot, "secret.srt");
  const attachment = path.join(tempRoot, "source-secret.txt");
  const metadata = path.join(tempRoot, "source.ffmeta");

  fs.writeFileSync(
    subtitle,
    "1\n00:00:00,000 --> 00:00:01,500\nSOURCE_SECRET_SUBTITLE\n",
  );
  fs.writeFileSync(attachment, "SOURCE_SECRET_ATTACHMENT");
  fs.writeFileSync(
    metadata,
    [
      ";FFMETADATA1",
      "title=SOURCE_SECRET_TITLE",
      "artist=SOURCE_SECRET_AUTHOR",
      "comment=SOURCE_SECRET_COMMENT",
      "creation_time=2024-01-02T03:04:05Z",
      "location=SOURCE_SECRET_LOCATION",
      "[CHAPTER]",
      "TIMEBASE=1/1000",
      "START=0",
      "END=1000",
      "title=SOURCE_SECRET_CHAPTER",
      "",
    ].join("\n"),
  );

  await runProcess("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=320x240:rate=25:duration=2",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=1000:sample_rate=44100:duration=2",
    "-f",
    "srt",
    "-i",
    subtitle,
    "-f",
    "ffmetadata",
    "-i",
    metadata,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-map",
    "2:s:0",
    "-map_metadata",
    "3",
    "-map_chapters",
    "3",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-c:s",
    "srt",
    "-metadata:s:v:0",
    "device_model=SOURCE_SECRET_CAMERA",
    "-attach",
    attachment,
    "-metadata:s:t",
    "mimetype=text/plain",
    "-metadata:s:t",
    "filename=SOURCE_SECRET_ATTACHMENT.txt",
    poisonFile,
  ]);
}

test.before(async () => {
  await createPoisonFixture();
});

test.after(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("poison fixture is rejected by the strict verifier", async () => {
  const result = await verifyFile(poisonFile);
  assert.equal(result.ok, false);
  assert.ok(result.issues.length > 0);
});

test("sanitizer rebuilds poison fixture into a verified origin-free MP4", async () => {
  const result = await sanitizeFile(poisonFile, cleanFile, { force: true });
  assert.equal(result.verification.ok, true);

  const bytes = fs.readFileSync(cleanFile).toString("latin1");
  assert.doesNotMatch(bytes, /SOURCE_SECRET/i);
  assert.doesNotMatch(bytes, /\bx264\b/i);
  assert.doesNotMatch(bytes, /\bLavf\d/i);
});

test("verifier rejects metadata reinserted after sanitization", async () => {
  const tamperedFile = path.join(tempRoot, "tampered.mp4");
  await runProcess("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    cleanFile,
    "-map",
    "0",
    "-c",
    "copy",
    "-metadata",
    "title=SOURCE_SECRET_REINSERTED",
    "-movflags",
    "use_metadata_tags",
    tamperedFile,
  ]);

  const result = await verifyFile(tamperedFile);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => /forbidden|SOURCE_SECRET/i.test(issue)));
});

test("verifier rejects an unknown box injected into moov", async () => {
  const tamperedFile = path.join(tempRoot, "unknown-box.mp4");
  const original = fs.readFileSync(cleanFile);
  const moov = inspectMp4(cleanFile).boxes.find(
    (box) => box.type === "moov" && box.parentOffset === null,
  );
  const injected = Buffer.alloc(8);
  injected.writeUInt32BE(8, 0);
  injected.write("junk", 4, "latin1");
  const moovEnd = moov.offset + moov.size;
  const tampered = Buffer.concat([
    original.subarray(0, moovEnd),
    injected,
    original.subarray(moovEnd),
  ]);
  tampered.writeUInt32BE(moov.size + injected.length, moov.offset);
  fs.writeFileSync(tamperedFile, tampered);

  const result = await verifyFile(tamperedFile);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => /not allowlisted.*moov\.junk/i.test(issue)));
});

test("verifier rejects even a short trailing payload", async () => {
  const tamperedFile = path.join(tempRoot, "trailing-bytes.mp4");
  fs.copyFileSync(cleanFile, tamperedFile);
  fs.appendFileSync(tamperedFile, Buffer.from([0xde, 0xad, 0xbe, 0xef]));

  const result = await verifyFile(tamperedFile);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => /4 unparsed byte/i.test(issue)));
});
