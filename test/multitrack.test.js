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

test("blur clips normalize censor region, strength, and duration", () => {
  const blur = Timeline.createBlurClip({
    id: "blur",
    trackId: "v2",
    start: 1,
    duration: 3,
    effect: {
      x: 140,
      y: -20,
      width: 1,
      height: 120,
      strength: 999,
    },
  });

  assert.equal(blur.type, "blur");
  assert.equal(blur.assetPath, null);
  assert.equal(blur.effect.x, 100);
  assert.equal(blur.effect.y, 0);
  assert.equal(blur.effect.width, 2);
  assert.equal(blur.effect.height, 100);
  assert.equal(blur.effect.strength, 60);
  assert.equal(Timeline.clipDuration(blur), 3);

  const updated = Timeline.updateBlurClip([blur], "blur", {
    duration: 2,
    effect: { x: 25, y: 75, width: 30, strength: 12 },
  });
  assert.equal(updated[0].effect.x, 25);
  assert.equal(updated[0].effect.y, 75);
  assert.equal(updated[0].effect.width, 30);
  assert.equal(updated[0].effect.strength, 12);
  assert.equal(Timeline.clipDuration(updated[0]), 2);
});

test("blur keyframes interpolate tracking position and can be cleared", () => {
  const blur = Timeline.createBlurClip({
    id: "blur",
    trackId: "v2",
    start: 10,
    duration: 4,
    effect: { x: 10, y: 20, width: 20, height: 10, strength: 10 },
  });

  let clips = Timeline.updateBlurClipAtTime([blur], "blur", 10, {
    effect: { x: 10, y: 20, width: 20, height: 10, strength: 10 },
  });
  clips = Timeline.updateBlurClipAtTime(clips, "blur", 14, {
    effect: { x: 90, y: 60, width: 40, height: 30, strength: 30 },
  });

  assert.equal(clips[0].keyframes.length, 2);
  const middle = Timeline.blurEffectAt(clips[0], 12);
  assert.equal(middle.x, 50);
  assert.equal(middle.y, 40);
  assert.equal(middle.width, 30);
  assert.equal(middle.height, 20);
  assert.equal(middle.strength, 20);

  const cleared = Timeline.clearBlurKeyframes(clips, "blur", 12);
  assert.equal(cleared[0].keyframes.length, 0);
  assert.equal(cleared[0].effect.x, 50);
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

test("media transforms use base and overlay defaults and normalize crop", () => {
  const base = Timeline.createClip({ id: "base", asset: videoAsset, trackId: "v1" });
  const overlay = Timeline.createClip({
    id: "overlay",
    asset: videoAsset,
    trackId: "v2",
  });
  assert.equal(base.transform.scale, 1);
  assert.equal(overlay.transform.scale, 0.5);

  const updated = Timeline.updateClipTransform([overlay], "overlay", {
    x: 120,
    y: -5,
    scale: 10,
    fitMode: "fill",
    crop: { left: 0.8, right: 0.8 },
  })[0];
  assert.equal(updated.transform.x, 100);
  assert.equal(updated.transform.y, 0);
  assert.equal(updated.transform.scale, 4);
  assert.equal(updated.transform.fitMode, "fill");
  assert.ok(updated.transform.crop.left + updated.transform.crop.right <= 0.95);
});

test("media color adjustments normalize per clip", () => {
  const clip = Timeline.createClip({ id: "clip", asset: videoAsset, trackId: "v1" });
  assert.deepEqual(clip.colorAdjustment, {
    brightness: 0,
    contrast: 100,
    saturation: 100,
    warmth: 0,
  });

  const updated = Timeline.updateClipColorAdjustment([clip], "clip", {
    brightness: 150,
    contrast: -5,
    saturation: 220,
    warmth: -140,
  })[0];

  assert.deepEqual(updated.colorAdjustment, {
    brightness: 100,
    contrast: 0,
    saturation: 200,
    warmth: -100,
  });
});
