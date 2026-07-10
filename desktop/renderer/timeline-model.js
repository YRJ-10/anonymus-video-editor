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

  function snapTime(time, pixelsPerSecond, gridSeconds = 1, thresholdPixels = 8) {
    const value = Math.max(0, finiteNumber(time));
    const grid = Math.max(0.001, finiteNumber(gridSeconds, 1));
    const pixels = Math.max(0.01, finiteNumber(pixelsPerSecond, 1));
    const threshold = Math.min(0.2, Math.max(0, thresholdPixels) / pixels);
    const snapped = Math.round(value / grid) * grid;
    return Math.abs(snapped - value) <= threshold ? roundTime(snapped) : roundTime(value);
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

  function normalizeBlurEffect(effect) {
    return {
      x: roundTime(clampNumber(effect?.x ?? 50, 0, 100)),
      y: roundTime(clampNumber(effect?.y ?? 50, 0, 100)),
      width: roundTime(clampNumber(effect?.width ?? 24, 2, 100)),
      height: roundTime(clampNumber(effect?.height ?? 16, 2, 100)),
      strength: Math.round(clampNumber(effect?.strength ?? 18, 1, 60)),
    };
  }

  function normalizeBlurKeyframes(keyframes, duration = 5, fallbackEffect = null) {
    if (!Array.isArray(keyframes)) return [];
    const maximum = Math.max(MIN_CLIP_DURATION, finiteNumber(Number(duration), 5));
    const byTime = new Map();
    for (const keyframe of keyframes) {
      const time = roundTime(clampNumber(keyframe?.time, 0, maximum));
      byTime.set(time, {
        time,
        effect: normalizeBlurEffect(keyframe?.effect || fallbackEffect),
      });
    }
    return [...byTime.values()].sort((left, right) => left.time - right.time);
  }

  function interpolateBlurEffect(left, right, ratio) {
    const amount = clampNumber(ratio, 0, 1);
    const lerp = (start, end) => start + (end - start) * amount;
    return normalizeBlurEffect({
      x: lerp(left.x, right.x),
      y: lerp(left.y, right.y),
      width: lerp(left.width, right.width),
      height: lerp(left.height, right.height),
      strength: lerp(left.strength, right.strength),
    });
  }

  function blurEffectAt(clip, timelineTime) {
    const fallback = normalizeBlurEffect(clip?.effect);
    if (!clip || clip.type !== "blur") return fallback;
    const assetDuration = Math.max(
      clip.sourceOut || 0,
      clip.assetDuration || 0,
      MIN_CLIP_DURATION,
    );
    const keyframes = normalizeBlurKeyframes(clip.keyframes, assetDuration, fallback);
    if (keyframes.length === 0) return fallback;

    const sourceTime = roundTime(
      clampNumber(
        clip.sourceIn + finiteNumber(Number(timelineTime), clip.start) - clip.start,
        0,
        assetDuration,
      ),
    );
    if (sourceTime <= keyframes[0].time) return keyframes[0].effect;
    const last = keyframes[keyframes.length - 1];
    if (sourceTime >= last.time) return last.effect;
    for (let index = 0; index < keyframes.length - 1; index += 1) {
      const left = keyframes[index];
      const right = keyframes[index + 1];
      if (sourceTime >= left.time && sourceTime <= right.time) {
        const span = Math.max(0.0001, right.time - left.time);
        return interpolateBlurEffect(left.effect, right.effect, (sourceTime - left.time) / span);
      }
    }
    return fallback;
  }

  function createBlurClip({
    id,
    trackId = "v2",
    start = 0,
    duration = 5,
    effect = null,
  }) {
    if (!id) throw new Error("A blur clip id is required");
    const normalizedDuration = Math.max(MIN_CLIP_DURATION, finiteNumber(duration, 5));

    return {
      id,
      assetPath: null,
      assetName: "Blur / Sensor",
      type: "blur",
      trackId,
      start: roundTime(Math.max(0, finiteNumber(start))),
      sourceIn: 0,
      sourceOut: roundTime(normalizedDuration),
      assetDuration: roundTime(normalizedDuration),
      effect: normalizeBlurEffect(effect),
      keyframes: [],
    };
  }

  function createAudioClip({ id, videoClip, trackId = "a1" }) {
    if (!id) throw new Error("An audio clip id is required");
    if (!videoClip || videoClip.type !== "video") {
      throw new Error("A video clip is required to detach audio");
    }
    return {
      id,
      assetPath: videoClip.assetPath,
      assetName: videoClip.assetName,
      type: "audio",
      trackId,
      start: roundTime(videoClip.start),
      sourceIn: roundTime(videoClip.sourceIn),
      sourceOut: roundTime(videoClip.sourceOut),
      assetDuration: roundTime(videoClip.assetDuration),
      volume: clampNumber(videoClip.volume ?? 1, 0, 2),
      muted: Boolean(videoClip.muted),
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
      if (["text", "blur", "audio"].includes(clip.type)) return clip;
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

  function updateBlurClip(clips, clipId, changes) {
    return updateClip(clips, clipId, (clip) => {
      if (clip.type !== "blur") return clip;
      const duration =
        changes.duration === undefined
          ? clipDuration(clip)
          : Math.max(MIN_CLIP_DURATION, finiteNumber(Number(changes.duration), 5));
      return {
        ...clip,
        assetName: cleanBlurName(changes.assetName ?? clip.assetName),
        effect: normalizeBlurEffect({
          ...normalizeBlurEffect(clip.effect),
          ...(changes.effect || changes),
        }),
        keyframes: normalizeBlurKeyframes(
          changes.keyframes ?? clip.keyframes,
          clip.sourceIn + duration,
          clip.effect,
        ),
        sourceOut: roundTime(clip.sourceIn + duration),
        assetDuration: roundTime(clip.sourceIn + duration),
      };
    });
  }

  function updateBlurClipAtTime(clips, clipId, timelineTime, changes) {
    return updateClip(clips, clipId, (clip) => {
      if (clip.type !== "blur") return clip;
      const assetDuration = Math.max(
        clip.sourceOut || 0,
        clip.assetDuration || 0,
        MIN_CLIP_DURATION,
      );
      const sourceTime = roundTime(
        clampNumber(
          clip.sourceIn + finiteNumber(Number(timelineTime), clip.start) - clip.start,
          0,
          assetDuration,
        ),
      );
      const current = blurEffectAt(clip, timelineTime);
      const nextEffect = normalizeBlurEffect({
        ...current,
        ...(changes.effect || changes),
      });
      const keyframes = normalizeBlurKeyframes(clip.keyframes, assetDuration, clip.effect);
      if (keyframes.length === 0) {
        keyframes.push({
          time: roundTime(clip.sourceIn),
          effect: blurEffectAt(clip, clip.start),
        });
      }
      const existing = keyframes.find((keyframe) => Math.abs(keyframe.time - sourceTime) <= 0.0334);
      if (existing) existing.effect = nextEffect;
      else keyframes.push({ time: sourceTime, effect: nextEffect });
      const normalizedKeyframes = normalizeBlurKeyframes(keyframes, assetDuration, nextEffect);
      return {
        ...clip,
        effect: normalizedKeyframes[0]?.effect || nextEffect,
        keyframes: normalizedKeyframes,
      };
    });
  }

  function clearBlurKeyframes(clips, clipId, timelineTime) {
    return updateClip(clips, clipId, (clip) => {
      if (clip.type !== "blur") return clip;
      return {
        ...clip,
        effect: blurEffectAt(clip, finiteNumber(Number(timelineTime), clip.start)),
        keyframes: [],
      };
    });
  }

  function cleanBlurName(value) {
    const normalized = String(value || "").trim();
    return normalized || "Blur / Sensor";
  }

  function updateAudioClip(clips, clipId, changes) {
    return updateClip(clips, clipId, (clip) => {
      if (!["video", "audio"].includes(clip.type)) return clip;
      return {
        ...clip,
        volume:
          changes.volume === undefined
            ? clampNumber(clip.volume ?? 1, 0, 2)
            : roundTime(clampNumber(changes.volume, 0, 2)),
        muted: changes.muted === undefined ? Boolean(clip.muted) : Boolean(changes.muted),
      };
    });
  }

  return Object.freeze({
    MIN_CLIP_DURATION,
    appendClip,
    clipDuration,
    clipEnd,
    createAudioClip,
    createBlurClip,
    createClip,
    createTextClip,
    blurEffectAt,
    clearBlurKeyframes,
    deleteClip,
    findClipAt,
    findClipsAt,
    moveClip,
    normalizeTransform,
    normalizeBlurEffect,
    normalizeBlurKeyframes,
    snapTime,
    splitClip,
    timelineEnd,
    trackEnd,
    trimClipLeft,
    trimClipRight,
    updateClipTransform,
    updateAudioClip,
    updateBlurClipAtTime,
    updateBlurClip,
    updateTextClip,
  });
});
