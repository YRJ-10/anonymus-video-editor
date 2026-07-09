"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Timeline = require("../desktop/renderer/timeline-model");

const videoAsset = {
  path: "D:\\Media\\video.mp4",
  name: "video.mp4",
  type: "video",
  duration: 10,
};

test("clips append independently within each track", () => {
  const v1a = Timeline.createClip({ id: "v1a", asset: videoAsset, trackId: "v1" });
  const v2a = Timeline.createClip({ id: "v2a", asset: videoAsset, trackId: "v2" });
  const v1b = Timeline.createClip({ id: "v1b", asset: videoAsset, trackId: "v1" });

  let clips = Timeline.appendClip([], v1a);
  clips = Timeline.appendClip(clips, v2a);
  clips = Timeline.appendClip(clips, v1b);

  assert.equal(clips[0].start, 0);
  assert.equal(clips[1].start, 0);
  assert.equal(clips[2].start, 10);
  assert.equal(Timeline.trackEnd(clips, "v1"), 20);
  assert.equal(Timeline.trackEnd(clips, "v2"), 10);
});

test("clips can move between tracks without changing source range", () => {
  const clip = Timeline.createClip({ id: "clip", asset: videoAsset, trackId: "v1" });
  const moved = Timeline.moveClip([clip], "clip", 3, "v3");

  assert.equal(moved[0].trackId, "v3");
  assert.equal(moved[0].start, 3);
  assert.equal(moved[0].sourceIn, 0);
  assert.equal(moved[0].sourceOut, 10);
});

test("text annotations normalize style, position, and duration", () => {
  const text = Timeline.createTextClip({
    id: "text",
    text: " Anonymous ",
    trackId: "v2",
    start: 2,
    duration: 4,
    fontSize: 999,
    color: "#7c6cff",
    x: 120,
    y: -5,
  });

  assert.equal(text.text, "Anonymous");
  assert.equal(text.fontSize, 160);
  assert.equal(text.color, "#7c6cff");
  assert.equal(text.x, 100);
  assert.equal(text.y, 0);
  assert.equal(Timeline.clipDuration(text), 4);

  const updated = Timeline.updateTextClip([text], "text", {
    text: "Updated",
    fontSize: 36,
    x: 25,
    y: 75,
  });
  assert.equal(updated[0].text, "Updated");
  assert.equal(updated[0].fontSize, 36);
  assert.equal(updated[0].x, 25);
  assert.equal(updated[0].y, 75);
});

test("all overlapping clips are returned for composition", () => {
  const base = Timeline.createClip({ id: "base", asset: videoAsset, trackId: "v1" });
  const overlay = Timeline.createClip({
    id: "overlay",
    asset: videoAsset,
    trackId: "v2",
    start: 0,
  });
  const clips = [base, overlay];

  assert.deepEqual(
    Timeline.findClipsAt(clips, 5).map((clip) => clip.id),
    ["base", "overlay"],
  );
});
