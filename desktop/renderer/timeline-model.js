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

  function normalizeTransform(transform, trackId = "v1") {
    const crop = transform?.crop || {};
    let left = clampNumber(crop.left, 0, 0.9);
    let right = clampNumber(crop.right, 0, 0.9);
    let top = clampNumber(crop.top, 0, 0.9);
    let bottom = clampNumber(crop.bottom, 0, 0.9);
    if (left + right > 0.95) {
      const ratio = 0.95 / (left + right);
      left *= ratio;
      right *= ratio;
    }
    if (top + bottom > 0.95) {
      const ratio = 0.95 / (top + bottom);
      top *= ratio;
      bottom *= ratio;
    }

    return {
      x: roundTime(clampNumber(transform?.x ?? 50, 0, 100)),
      y: roundTime(clampNumber(transform?.y ?? 50, 0, 100)),
      scale: roundTime(
        clampNumber(transform?.scale ?? (trackId === "v1" ? 1 : 0.5), 0.05, 4),
      ),
      fitMode: ["fit", "fill"].includes(transform?.fitMode)
        ? transform.fitMode
        : "fit",
      crop: {
        left: roundTime(left),
        right: roundTime(right),
        top: roundTime(top),
        bottom: roundTime(bottom),
      },
    };
  }

  function createClip({ id, asset, start = 0, trackId = "v1" }) {
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
      trackId,
      start: roundTime(Math.max(0, finiteNumber(start))),
      sourceIn: 0,
      sourceOut: roundTime(duration),
      assetDuration: roundTime(duration),
      transform: normalizeTransform(null, trackId),
    };
  }

  function createTextClip({
    id,
    text,
    trackId = "v2",
    start = 0,
    duration = 5,
    fontSize = 48,
    color = "#ffffff",
    x = 50,
    y = 50,
  }) {
    if (!id) throw new Error("A text clip id is required");
    const normalizedText = String(text || "").trim();
    if (!normalizedText) throw new Error("Text cannot be empty");
    const normalizedDuration = Math.max(MIN_CLIP_DURATION, finiteNumber(duration, 5));

    return {
      id,
      assetPath: null,
      assetName: normalizedText,
      type: "text",
      trackId,
      start: roundTime(Math.max(0, finiteNumber(start))),
      sourceIn: 0,
      sourceOut: roundTime(normalizedDuration),
      assetDuration: roundTime(normalizedDuration),
      text: normalizedText,
      fontSize: Math.round(clampNumber(fontSize, 12, 160)),
      color: /^#[0-9a-f]{6}$/i.test(color) ? color : "#ffffff",
      x: roundTime(clampNumber(x, 0, 100)),
      y: roundTime(clampNumber(y, 0, 100)),
    };
  }

  function clampNumber(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, finiteNumber(Number(value), minimum)));
  }

  function timelineEnd(clips) {
    return clips.reduce((maximum, clip) => Math.max(maximum, clipEnd(clip)), 0);
  }

  function trackEnd(clips, trackId) {
    return clips
      .filter((clip) => clip.trackId === trackId)
      .reduce((maximum, clip) => Math.max(maximum, clipEnd(clip)), 0);
  }

  function appendClip(clips, clip) {
    return [...clips, { ...clip, start: roundTime(trackEnd(clips, clip.trackId)) }];
  }

  function updateClip(clips, clipId, updater) {
    return clips.map((clip) => (clip.id === clipId ? updater({ ...clip }) : clip));
  }

  function moveClip(clips, clipId, requestedStart, requestedTrackId) {
    return updateClip(clips, clipId, (clip) => ({
      ...clip,
      trackId: requestedTrackId || clip.trackId,
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

  function findClipsAt(clips, timelineTime) {
    const time = finiteNumber(timelineTime, -1);
    return clips.filter((clip) => time >= clip.start && time < clipEnd(clip));
  }

  function updateTextClip(clips, clipId, changes) {
    return updateClip(clips, clipId, (clip) => {
      if (clip.type !== "text") return clip;
      const duration =
        changes.duration === undefined
          ? clipDuration(clip)
          : Math.max(MIN_CLIP_DURATION, finiteNumber(Number(changes.duration), 5));
      return {
        ...clip,
        text:
          changes.text === undefined ? clip.text : String(changes.text).trim() || clip.text,
        fontSize:
          changes.fontSize === undefined
            ? clip.fontSize
            : Math.round(clampNumber(changes.fontSize, 12, 160)),
        color:
          changes.color === undefined || !/^#[0-9a-f]{6}$/i.test(changes.color)
            ? clip.color
            : changes.color,
        x: changes.x === undefined ? clip.x : roundTime(clampNumber(changes.x, 0, 100)),
        y: changes.y === undefined ? clip.y : roundTime(clampNumber(changes.y, 0, 100)),
        sourceOut: roundTime(clip.sourceIn + duration),
        assetDuration: roundTime(clip.sourceIn + duration),
      };
    });
  }

  function updateClipTransform(clips, clipId, changes) {
    return updateClip(clips, clipId, (clip) => {
      if (clip.type === "text") return clip;
      const current = normalizeTransform(clip.transform, clip.trackId);
      return {
        ...clip,
        transform: normalizeTransform(
          {
            ...current,
            ...changes,
            crop: changes.crop ? { ...current.crop, ...changes.crop } : current.crop,
          },
          clip.trackId,
        ),
      };
    });
  }

  return Object.freeze({
    MIN_CLIP_DURATION,
    appendClip,
    clipDuration,
    clipEnd,
    createClip,
    createTextClip,
    deleteClip,
    findClipAt,
    findClipsAt,
    moveClip,
    normalizeTransform,
    splitClip,
    timelineEnd,
    trackEnd,
    trimClipLeft,
    trimClipRight,
    updateClipTransform,
    updateTextClip,
  });
});
