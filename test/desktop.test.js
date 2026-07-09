"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  classifyMediaFile,
  displayDimensions,
  shouldBlockRequest,
} = require("../desktop/media-policy");

test("desktop media picker classifies supported video and photo formats", () => {
  assert.equal(classifyMediaFile("D:\\Media\\clip.MP4"), "video");
  assert.equal(classifyMediaFile("D:\\Media\\photo.JPEG"), "image");
  assert.equal(classifyMediaFile("D:\\Media\\notes.txt"), null);
  assert.equal(classifyMediaFile("D:\\Media\\fake.mp4.exe"), null);
});

test("display dimensions account for quarter-turn rotation", () => {
  assert.deepEqual(displayDimensions({ width: 1920, height: 1080 }), {
    width: 1920,
    height: 1080,
  });
  assert.deepEqual(
    displayDimensions({
      width: 1920,
      height: 1080,
      side_data_list: [{ rotation: -90 }],
    }),
    { width: 1080, height: 1920 },
  );
});

test("desktop network boundary blocks remote protocols", () => {
  assert.equal(shouldBlockRequest("https://example.com/collect"), true);
  assert.equal(shouldBlockRequest("http://example.com/collect"), true);
  assert.equal(shouldBlockRequest("wss://example.com/socket"), true);
  assert.equal(shouldBlockRequest("file:///D:/Media/video.mp4"), false);
  assert.equal(shouldBlockRequest("data:image/png;base64,AA=="), false);
  assert.equal(shouldBlockRequest("blob:null/id"), false);
  assert.equal(shouldBlockRequest("not a valid url"), true);
});
