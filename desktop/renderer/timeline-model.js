(function exposeTimelineModel(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TimelineModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createTimelineModel() {
  "use strict";

  const MIN_CLIP_DURATION = 0.1;

  function finiteNumber(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
  }

  function roundTime(value) {
    return Math.round(value * 10000) / 10000;
  }

  function clipDuration(clip) {
    return Math.max(0, clip.sourceOut - clip.sourceIn);
  }

  function clipEnd(clip) {
    return clip.start + clipDuration(clip);
  }

  function createClip({ id, asset, start = 0 }) {
    if (!id) throw new Error("A clip id is required");
    if (!asset?.path || !asset?.name || !asset?.type) {
      throw new Error("A valid media asset is required");
    }

    const duration = finiteNumber(asset.duration);
    if (duration <= 0) throw new Error("Asset duration must be known before adding it");

    return {
      id,
      assetPath: asset.path,
      assetName: asset.name,
      type: asset.type,
      start: roundTime(Math.max(0, finiteNumber(start))),
      sourceIn: 0,
      sourceOut: roundTime(duration),
      assetDuration: roundTime(duration),
    };
  }

  function timelineEnd(clips) {
    return clips.reduce((maximum, clip) => Math.max(maximum, clipEnd(clip)), 0);
  }

  function appendClip(clips, clip) {
    return [...clips, { ...clip, start: roundTime(timelineEnd(clips)) }];
  }

  function updateClip(clips, clipId, updater) {
    return clips.map((clip) => (clip.id === clipId ? updater({ ...clip }) : clip));
  }

  function moveClip(clips, clipId, requestedStart) {
    return updateClip(clips, clipId, (clip) => ({
      ...clip,
      start: roundTime(Math.max(0, finiteNumber(requestedStart))),
    }));
  }

  function trimClipLeft(clips, clipId, requestedStart) {
    return updateClip(clips, clipId, (clip) => {
      const end = clipEnd(clip);
      const earliestStart = Math.max(0, clip.start - clip.sourceIn);
      const latestStart = end - MIN_CLIP_DURATION;
      const nextStart = Math.min(
        latestStart,
        Math.max(earliestStart, finiteNumber(requestedStart, clip.start)),
      );
      const delta = nextStart - clip.start;

      return {
        ...clip,
        start: roundTime(nextStart),
        sourceIn: roundTime(clip.sourceIn + delta),
      };
    });
  }

  function trimClipRight(clips, clipId, requestedEnd) {
    return updateClip(clips, clipId, (clip) => {
      const earliestEnd = clip.start + MIN_CLIP_DURATION;
      const latestEnd = clip.start + (clip.assetDuration - clip.sourceIn);
      const nextEnd = Math.min(
        latestEnd,
        Math.max(earliestEnd, finiteNumber(requestedEnd, clipEnd(clip))),
      );

      return {
        ...clip,
        sourceOut: roundTime(clip.sourceIn + (nextEnd - clip.start)),
      };
    });
  }

  function splitClip(clips, clipId, timelineTime, newId) {
    const clip = clips.find((candidate) => candidate.id === clipId);
    if (!clip || !newId) return { clips, rightId: null };

    const splitAt = finiteNumber(timelineTime, -1);
    const end = clipEnd(clip);
    if (
      splitAt <= clip.start + MIN_CLIP_DURATION ||
      splitAt >= end - MIN_CLIP_DURATION
    ) {
      return { clips, rightId: null };
    }

    const sourceSplit = clip.sourceIn + (splitAt - clip.start);
    const left = { ...clip, sourceOut: roundTime(sourceSplit) };
    const right = {
      ...clip,
      id: newId,
      start: roundTime(splitAt),
      sourceIn: roundTime(sourceSplit),
    };

    const index = clips.findIndex((candidate) => candidate.id === clipId);
    const next = clips.slice();
    next.splice(index, 1, left, right);
    return { clips: next, rightId: newId };
  }

  function deleteClip(clips, clipId) {
    return clips.filter((clip) => clip.id !== clipId);
  }

  function findClipAt(clips, timelineTime) {
    const time = finiteNumber(timelineTime, -1);
    for (let index = clips.length - 1; index >= 0; index -= 1) {
      const clip = clips[index];
      if (time >= clip.start && time < clipEnd(clip)) return clip;
    }
    return null;
  }

  return Object.freeze({
    MIN_CLIP_DURATION,
    appendClip,
    clipDuration,
    clipEnd,
    createClip,
    deleteClip,
    findClipAt,
    moveClip,
    splitClip,
    timelineEnd,
    trimClipLeft,
    trimClipRight,
  });
});
