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

test("timeline appends clips without losing their source ranges", () => {
  const first = Timeline.createClip({ id: "a", asset: videoAsset });
  const second = Timeline.createClip({ id: "b", asset: videoAsset });
  const clips = Timeline.appendClip(Timeline.appendClip([], first), second);

  assert.equal(clips[0].start, 0);
  assert.equal(clips[1].start, 10);
  assert.equal(Timeline.timelineEnd(clips), 20);
  assert.equal(Timeline.clipDuration(clips[1]), 10);
});

test("timeline magnet snaps near grid lines and leaves distant times free", () => {
  assert.equal(Timeline.snapTime(4.96, 100), 5);
  assert.equal(Timeline.snapTime(4.7, 100), 4.7);
  assert.equal(Timeline.snapTime(0.02, 100), 0);
});

test("frame stepping snaps to the 30 fps export grid", () => {
  assert.equal(Timeline.FRAME_RATE, 30);
  assert.equal(Timeline.snapFrameTime(1 / 30), 0.0333);
  assert.equal(Timeline.snapFrameTime(0.049), 0.0333);
  assert.equal(Timeline.snapFrameTime(0.051), 0.0667);
});

test("detached audio inherits the video source range and audio level", () => {
  const video = {
    ...Timeline.createClip({ id: "video", asset: videoAsset }),
    start: 2,
    sourceIn: 1,
    sourceOut: 8,
    volume: 1.4,
    muted: true,
  };
  const audio = Timeline.createAudioClip({ id: "audio", videoClip: video, trackId: "a1" });
  assert.equal(audio.type, "audio");
  assert.equal(audio.trackId, "a1");
  assert.equal(audio.start, 2);
  assert.equal(audio.sourceIn, 1);
  assert.equal(audio.sourceOut, 8);
  assert.equal(audio.volume, 1.4);
  assert.equal(audio.muted, true);
});

test("timeline split preserves total duration and source continuity", () => {
  const clip = Timeline.createClip({ id: "left", asset: videoAsset });
  const result = Timeline.splitClip([clip], "left", 4, "right");

  assert.equal(result.rightId, "right");
  assert.equal(result.clips.length, 2);
  assert.equal(result.clips[0].sourceOut, 4);
  assert.equal(result.clips[1].sourceIn, 4);
  assert.equal(result.clips[1].start, 4);
  assert.equal(Timeline.findClipAt(result.clips, 4).id, "right");
  assert.equal(
    Timeline.clipDuration(result.clips[0]) + Timeline.clipDuration(result.clips[1]),
    10,
  );
});

test("timeline rejects split points too close to clip edges", () => {
  const clip = Timeline.createClip({ id: "clip", asset: videoAsset });
  const clips = [clip];
  const result = Timeline.splitClip(clips, "clip", 0.05, "unused");
  assert.equal(result.rightId, null);
  assert.equal(result.clips, clips);
  assert.equal(result.clips.length, 1);
});

test("timeline trims both edges while preserving source bounds", () => {
  const clip = Timeline.createClip({ id: "clip", asset: videoAsset });
  const leftTrimmed = Timeline.trimClipLeft([clip], "clip", 2);
  assert.equal(leftTrimmed[0].start, 2);
  assert.equal(leftTrimmed[0].sourceIn, 2);
  assert.equal(Timeline.clipEnd(leftTrimmed[0]), 10);

  const rightTrimmed = Timeline.trimClipRight(leftTrimmed, "clip", 7);
  assert.equal(rightTrimmed[0].sourceOut, 7);
  assert.equal(Timeline.clipEnd(rightTrimmed[0]), 7);
});

test("timeline moves, finds, and deletes clips", () => {
  const clip = Timeline.createClip({ id: "clip", asset: videoAsset });
  const moved = Timeline.moveClip([clip], "clip", 5);
  assert.equal(moved[0].start, 5);
  assert.equal(Timeline.findClipAt(moved, 7)?.id, "clip");
  assert.equal(Timeline.findClipAt(moved, 4.9), null);
  assert.deepEqual(Timeline.deleteClip(moved, "clip"), []);
});
