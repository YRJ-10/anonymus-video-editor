"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { buildExportPlan, exportProject } = require("../src/export-project");
const { runProcess } = require("../src/process");
const { probeFile } = require("../src/probe");

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

test("portrait export applies fill, resize, position, and crop at 1080x1920", async () => {
  const portraitOutput = path.join(tempRoot, "anonymous-portrait.mp4");
  const project = {
    canvas: {
      orientation: "portrait",
      width: 1080,
      height: 1920,
      aspectRatio: "9:16",
    },
    assets: [
      {
        path: sourceFile,
        name: "SOURCE_SECRET_CAMERA.mp4",
        type: "video",
        duration: 1.2,
        width: 320,
        height: 240,
      },
    ],
    tracks: [{ id: "v1", name: "V1" }],
    clips: [
      {
        id: "portrait",
        assetPath: sourceFile,
        assetName: "SOURCE_SECRET_CAMERA.mp4",
        type: "video",
        trackId: "v1",
        start: 0,
        sourceIn: 0,
        sourceOut: 0.6,
        assetDuration: 1.2,
        transform: {
          x: 44,
          y: 57,
          scale: 0.8,
          fitMode: "fill",
          crop: { left: 0.1, right: 0.05, top: 0.08, bottom: 0.12 },
        },
      },
    ],
  };

  const result = await exportProject(project, portraitOutput, { force: true });
  assert.equal(result.verification.ok, true);
  const probe = await probeFile(portraitOutput);
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  assert.equal(video.width, 1080);
  assert.equal(video.height, 1920);
});

test("detached audio is mixed once with its independent volume", async () => {
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
      { id: "v1", name: "V1", kind: "video" },
      { id: "a1", name: "A1", kind: "audio" },
    ],
    clips: [
      {
        id: "video",
        assetPath: sourceFile,
        assetName: "SOURCE_SECRET_CAMERA.mp4",
        type: "video",
        trackId: "v1",
        start: 0,
        sourceIn: 0,
        sourceOut: 1,
        assetDuration: 1.2,
        audioDetached: true,
      },
      {
        id: "audio",
        assetPath: sourceFile,
        assetName: "SOURCE_SECRET_CAMERA.mp4",
        type: "audio",
        trackId: "a1",
        start: 0.1,
        sourceIn: 0,
        sourceOut: 0.8,
        assetDuration: 1.2,
        volume: 0.5,
        muted: false,
      },
    ],
  };
  const plan = await buildExportPlan(project, {
    output: path.join(tempRoot, "detached-render.mp4"),
    supportDirectory: path.join(tempRoot, "detached-support"),
  });
  assert.match(plan.filterGraph, /volume=0\.5,adelay=.*\[detachedAudio0\]/);
  assert.doesNotMatch(plan.filterGraph, /\[audio0\]/);

  const output = path.join(tempRoot, "detached-anonymous.mp4");
  const result = await exportProject(project, output, { force: true });
  assert.equal(result.verification.ok, true);
  const probe = await probeFile(output);
  assert.equal(probe.streams.filter((stream) => stream.codec_type === "audio").length, 1);
});
