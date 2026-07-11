"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const History = require("../desktop/renderer/editor-history");
const {
  PROJECT_FORMAT,
  PROJECT_VERSION,
  parseProject,
  serializeProject,
} = require("../desktop/project-file");

test("history commits, undoes, redoes, and clears redo after a new edit", () => {
  let history = History.create({ clips: [] });
  history = History.commit(history, { clips: ["a"] });
  history = History.commit(history, { clips: ["a", "b"] });
  assert.equal(History.canUndo(history), true);

  history = History.undo(history);
  assert.deepEqual(history.present, { clips: ["a"] });
  assert.equal(History.canRedo(history), true);

  history = History.redo(history);
  assert.deepEqual(history.present, { clips: ["a", "b"] });

  history = History.undo(history);
  history = History.commit(history, { clips: ["a", "c"] });
  assert.equal(History.canRedo(history), false);
});

test("project files round-trip only supported editing data", () => {
  const project = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    assets: [
      { path: "D:\\Media\\clip.mp4", name: "clip.mp4", type: "video", duration: 10 },
    ],
    tracks: [{ id: "v1", name: "V1" }],
    clips: [
      {
        id: "clip",
        assetPath: "D:\\Media\\clip.mp4",
        assetName: "clip.mp4",
        type: "video",
        trackId: "v1",
        start: 0,
        sourceIn: 0,
        sourceOut: 10,
        assetDuration: 10,
      },
    ],
    activeTrackId: "v1",
    playhead: 2,
    pixelsPerSecond: 90,
    ignoredField: "must not survive",
  };

  const parsed = parseProject(serializeProject(project));
  assert.equal(parsed.format, PROJECT_FORMAT);
  assert.equal(parsed.clips.length, 1);
  assert.equal(parsed.ignoredField, undefined);
});

test("project parser rejects clips with unknown assets", () => {
  const invalid = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    assets: [],
    tracks: [{ id: "v1", name: "V1" }],
    clips: [
      {
        id: "bad",
        type: "video",
        trackId: "v1",
        assetPath: "missing.mp4",
        sourceIn: 0,
        sourceOut: 1,
      },
    ],
  };

  assert.throws(() => parseProject(JSON.stringify(invalid)), /unknown asset/);
});

test("project files preserve detached audio tracks and volume", () => {
  const project = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    assets: [
      {
        path: "D:\\Media\\clip.mp4",
        name: "clip.mp4",
        type: "video",
        duration: 10,
        hasAudio: true,
      },
    ],
    tracks: [
      { id: "v1", name: "V1", kind: "video" },
      { id: "a1", name: "A1", kind: "audio" },
    ],
    clips: [
      {
        id: "audio",
        assetPath: "D:\\Media\\clip.mp4",
        assetName: "clip.mp4",
        type: "audio",
        trackId: "a1",
        start: 1,
        sourceIn: 0,
        sourceOut: 4,
        assetDuration: 10,
        volume: 1.5,
        muted: false,
      },
    ],
    activeTrackId: "a1",
    pixelsPerSecond: 8,
  };
  const parsed = parseProject(serializeProject(project));
  assert.equal(parsed.tracks[1].kind, "audio");
  assert.equal(parsed.clips[0].type, "audio");
  assert.equal(parsed.clips[0].volume, 1.5);
  assert.equal(parsed.assets[0].hasAudio, true);
  assert.equal(parsed.pixelsPerSecond, 8);
});

test("project files preserve external audio assets", () => {
  const project = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    assets: [
      {
        path: "D:\\Media\\music.mp3",
        name: "music.mp3",
        type: "audio",
        duration: 12,
        hasAudio: true,
      },
    ],
    tracks: [{ id: "a1", name: "A1", kind: "audio" }],
    clips: [
      {
        id: "music",
        assetPath: "D:\\Media\\music.mp3",
        assetName: "music.mp3",
        type: "audio",
        trackId: "a1",
        start: 0,
        sourceIn: 1,
        sourceOut: 8,
        assetDuration: 12,
        volume: 0.75,
        muted: false,
      },
    ],
    activeTrackId: "a1",
  };

  const parsed = parseProject(serializeProject(project));
  assert.equal(parsed.assets[0].type, "audio");
  assert.equal(parsed.assets[0].duration, 12);
  assert.equal(parsed.clips[0].type, "audio");
  assert.equal(parsed.clips[0].volume, 0.75);
});

test("project files preserve media color adjustment", () => {
  const project = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    assets: [
      {
        path: "D:\\Media\\clip.mp4",
        name: "clip.mp4",
        type: "video",
        duration: 10,
      },
    ],
    tracks: [{ id: "v1", name: "V1", kind: "video" }],
    clips: [
      {
        id: "clip",
        assetPath: "D:\\Media\\clip.mp4",
        assetName: "clip.mp4",
        type: "video",
        trackId: "v1",
        start: 0,
        sourceIn: 0,
        sourceOut: 5,
        assetDuration: 10,
        colorAdjustment: {
          brightness: 18,
          contrast: 115,
          saturation: 82,
          warmth: -22,
        },
      },
    ],
    activeTrackId: "v1",
  };

  const parsed = parseProject(serializeProject(project));
  assert.deepEqual(parsed.clips[0].colorAdjustment, {
    brightness: 18,
    contrast: 115,
    saturation: 82,
    warmth: -22,
  });
});

test("project files preserve manual blur clips without media assets", () => {
  const project = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    assets: [],
    tracks: [{ id: "v1", name: "V1", kind: "video" }],
    clips: [
      {
        id: "blur",
        assetPath: null,
        assetName: "Sensor",
        type: "blur",
        trackId: "v1",
        start: 0,
        sourceIn: 0,
        sourceOut: 5,
        assetDuration: 5,
        effect: {
          x: 25,
          y: 75,
          width: 40,
          height: 20,
          strength: 24,
        },
        keyframes: [
          {
            time: 0,
            effect: { x: 25, y: 75, width: 40, height: 20, strength: 24 },
          },
          {
            time: 5,
            effect: { x: 75, y: 25, width: 20, height: 40, strength: 18 },
          },
        ],
      },
    ],
    activeTrackId: "v1",
  };

  const parsed = parseProject(serializeProject(project));
  assert.equal(parsed.clips[0].type, "blur");
  assert.equal(parsed.clips[0].assetPath, null);
  assert.equal(parsed.clips[0].effect.strength, 24);
  assert.equal(parsed.clips[0].effect.width, 40);
  assert.equal(parsed.clips[0].keyframes.length, 2);
  assert.equal(parsed.clips[0].keyframes[1].effect.x, 75);
});
