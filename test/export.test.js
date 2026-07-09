"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { exportProject } = require("../src/export-project");
const { runProcess } = require("../src/process");

const tempRoot = path.join(process.cwd(), ".tmp-export-tests");
const sourceFile = path.join(tempRoot, "SOURCE_SECRET_CAMERA.mp4");
const outputFile = path.join(tempRoot, "anonymous-export.mp4");

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
    "testsrc2=size=320x240:rate=24:duration=1.2",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=44100:duration=1.2",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-metadata",
    "title=SOURCE_SECRET_TITLE",
    "-metadata",
    "creation_time=2024-01-02T03:04:05Z",
    "-metadata",
    "location=SOURCE_SECRET_LOCATION",
    "-movflags",
    "use_metadata_tags",
    sourceFile,
  ]);
});

test.after(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("project export composites tracks and text, then passes strict privacy verification", async () => {
  const project = {
    assets: [
      {
        path: sourceFile,
        name: "SOURCE_SECRET_CAMERA.mp4",
        type: "video",
        duration: 1.2,
      },
    ],
    tracks: [
      { id: "v1", name: "V1" },
      { id: "v2", name: "V2" },
      { id: "v3", name: "V3" },
    ],
    clips: [
      {
        id: "base",
        assetPath: sourceFile,
        assetName: "SOURCE_SECRET_CAMERA.mp4",
        type: "video",
        trackId: "v1",
        start: 0,
        sourceIn: 0,
        sourceOut: 1.2,
        assetDuration: 1.2,
      },
      {
        id: "overlay",
        assetPath: sourceFile,
        assetName: "SOURCE_SECRET_CAMERA.mp4",
        type: "video",
        trackId: "v2",
        start: 0.2,
        sourceIn: 0.1,
        sourceOut: 0.6,
        assetDuration: 1.2,
      },
      {
        id: "text",
        assetPath: null,
        assetName: "Anonymous",
        type: "text",
        trackId: "v3",
        start: 0.1,
        sourceIn: 0,
        sourceOut: 0.9,
        assetDuration: 0.8,
        text: "Anonymous",
        fontSize: 48,
        color: "#ffffff",
        x: 50,
        y: 50,
      },
    ],
  };

  const progress = [];
  const result = await exportProject(project, outputFile, {
    force: true,
    onProgress: (value) => progress.push(value),
  });

  assert.equal(result.verification.ok, true);
  assert.equal(result.verification.issues.length, 0);
  assert.ok(fs.existsSync(outputFile));
  assert.ok(progress.some((value) => value === 1));

  const bytes = fs.readFileSync(outputFile).toString("latin1");
  assert.doesNotMatch(bytes, /SOURCE_SECRET/i);
  assert.doesNotMatch(bytes, /\bx264\b/i);
  assert.doesNotMatch(bytes, /\bLavf\d/i);
});
