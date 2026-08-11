(function exposeTimelineModel(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TimelineModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createTimelineModel() {
  "use strict";

  const FRAME_RATE = 30;
  const FRAME_DURATION = 1 / FRAME_RATE;
  const MIN_CLIP_DURATION = 0.1;

  function finiteNumber(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
  }

  function roundTime(value) {
    return Math.round(value * 10000) / 10000;
  }

  function snapFrameTime(time) {
    return roundTime(
      Math.max(0, finiteNumber(Math.round(Number(time) * FRAME_RATE) / FRAME_RATE)),
    );
  }

  function clipDuration(clip) {
    return Math.max(0, clip.sourceOut - clip.sourceIn);
  }

  function clipEnd(clip) {
    return roundTime(clip.start + clipDuration(clip));
  }

  function snapTime(time, pixelsPerSecond, gridSeconds = 1, thresholdPixels = 8) {
    const value = Math.max(0, finiteNumber(time));
    const grid = Math.max(0.001, finiteNumber(gridSeconds, 1));
    const pixels = Math.max(0.01, finiteNumber(pixelsPerSecond, 1));
    const threshold = Math.min(0.2, Math.max(0, thresholdPixels) / pixels);
    const snapped = Math.round(value / grid) * grid;
    return Math.abs(snapped - value) <= threshold ? roundTime(snapped) : roundTime(value);
  }

  function smartSnapTime(time, pixelsPerSecond, clips = [], playhead = -1, thresholdPixels = 8, gridSeconds = 1) {
    const value = Math.max(0, finiteNumber(time));
    const pixels = Math.max(0.01, finiteNumber(pixelsPerSecond, 1));
    const threshold = Math.min(0.2, Math.max(0, thresholdPixels) / pixels);
    
    const magneticPoints = new Set();
    if (finiteNumber(playhead, -1) >= 0) magneticPoints.add(roundTime(playhead));
    
    for (const clip of clips) {
      magneticPoints.add(roundTime(clip.start));
      magneticPoints.add(roundTime(clipEnd(clip)));
    }
    
    let bestSnap = null;
    let minDistance = Infinity;
    
    for (const point of magneticPoints) {
      const distance = Math.abs(point - value);
      if (distance <= threshold && distance < minDistance) {
        minDistance = distance;
        bestSnap = point;
      }
    }
    
    if (bestSnap !== null) return bestSnap;
    
    const grid = Math.max(0.001, finiteNumber(gridSeconds, 1));
    const snapped = Math.round(value / grid) * grid;
    return Math.abs(snapped - value) <= threshold ? roundTime(snapped) : roundTime(value);
  }

  function enforceMagneticV1(clips) {
    const v1Clips = clips.filter((clip) => clip.trackId === "v1");
    if (v1Clips.length === 0) return clips;
    v1Clips.sort((a, b) => a.start - b.start);
    let cursor = 0;
    const v1Updates = new Map();
    for (const clip of v1Clips) {
      if (clip.start !== cursor) {
        v1Updates.set(clip.id, roundTime(cursor));
      }
      cursor += Math.max(MIN_CLIP_DURATION, clipDuration(clip));
    }
    if (v1Updates.size === 0) return clips;
    return clips.map((clip) => {
      if (v1Updates.has(clip.id)) return { ...clip, start: v1Updates.get(clip.id) };
      return clip;
    });
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

  function normalizeColorAdjustment(adjustment) {
    return {
      brightness: roundTime(clampNumber(adjustment?.brightness ?? 0, -100, 100)),
      contrast: roundTime(clampNumber(adjustment?.contrast ?? 100, 0, 200)),
      saturation: roundTime(clampNumber(adjustment?.saturation ?? 100, 0, 200)),
      warmth: roundTime(clampNumber(adjustment?.warmth ?? 0, -100, 100)),
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
      colorAdjustment: normalizeColorAdjustment(null),
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
      keyframes: [],
    };
  }

  function normalizeTextKeyframes(keyframes, duration = 5, fallbackPosition = null) {
    if (!Array.isArray(keyframes)) return [];
    const maximum = Math.max(MIN_CLIP_DURATION, finiteNumber(Number(duration), 5));
    const fallback = {
      x: clampNumber(fallbackPosition?.x ?? 50, 0, 100),
      y: clampNumber(fallbackPosition?.y ?? 50, 0, 100),
    };
    const byTime = new Map();
    for (const keyframe of keyframes) {
      const time = snapFrameTime(clampNumber(keyframe?.time, 0, maximum));
      byTime.set(time, {
        time,
        x: roundTime(clampNumber(keyframe?.x ?? fallback.x, 0, 100)),
        y: roundTime(clampNumber(keyframe?.y ?? fallback.y, 0, 100)),
      });
    }
    return [...byTime.values()].sort((left, right) => left.time - right.time);
  }

  function interpolateTextPosition(left, right, ratio) {
    const amount = clampNumber(ratio, 0, 1);
    const lerp = (start, end) => start + (end - start) * amount;
    return {
      x: roundTime(clampNumber(lerp(left.x, right.x), 0, 100)),
      y: roundTime(clampNumber(lerp(left.y, right.y), 0, 100)),
    };
  }

  function textPositionAt(clip, timelineTime) {
    const fallback = {
      x: roundTime(clampNumber(clip?.x ?? 50, 0, 100)),
      y: roundTime(clampNumber(clip?.y ?? 50, 0, 100)),
    };
    if (!clip || clip.type !== "text") return fallback;
    const assetDuration = Math.max(
      clip.sourceOut || 0,
      clip.assetDuration || 0,
      MIN_CLIP_DURATION,
    );
    const keyframes = normalizeTextKeyframes(clip.keyframes, assetDuration, fallback);
    if (keyframes.length === 0) return fallback;

    const sourceTime = snapFrameTime(
      clampNumber(
        clip.sourceIn + finiteNumber(Number(timelineTime), clip.start) - clip.start,
        0,
        assetDuration,
      ),
    );
    if (sourceTime <= keyframes[0].time) return keyframes[0];
    const last = keyframes[keyframes.length - 1];
    if (sourceTime >= last.time) return last;
    for (let index = 0; index < keyframes.length - 1; index += 1) {
      const left = keyframes[index];
      const right = keyframes[index + 1];
      if (sourceTime >= left.time && sourceTime <= right.time) {
        const span = Math.max(0.0001, right.time - left.time);
        return interpolateTextPosition(left, right, (sourceTime - left.time) / span);
      }
    }
    return fallback;
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
      const time = snapFrameTime(clampNumber(keyframe?.time, 0, maximum));
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

    const sourceTime = snapFrameTime(
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
  function normalizeMediaKeyframes(keyframes, duration = 5, fallbackTransform = null, trackId = "v1") {
    if (!Array.isArray(keyframes)) return [];
    const maximum = Math.max(MIN_CLIP_DURATION, finiteNumber(Number(duration), 5));
    const fallback = normalizeTransform(fallbackTransform, trackId);
    const byTime = new Map();
    for (const keyframe of keyframes) {
      const time = snapFrameTime(clampNumber(keyframe?.time, 0, maximum));
      byTime.set(time, {
        time,
        transform: normalizeTransform(keyframe?.transform ?? fallback, trackId),
      });
    }
    return [...byTime.values()].sort((left, right) => left.time - right.time);
  }

  function interpolateMediaTransform(left, right, ratio, trackId = "v1") {
    const amount = clampNumber(ratio, 0, 1);
    const lerp = (start, end) => start + (end - start) * amount;
    return normalizeTransform({
      x: lerp(left.transform.x, right.transform.x),
      y: lerp(left.transform.y, right.transform.y),
      scale: lerp(left.transform.scale, right.transform.scale),
      fitMode: left.transform.fitMode,
      crop: {
        left: lerp(left.transform.crop.left, right.transform.crop.left),
        right: lerp(left.transform.crop.right, right.transform.crop.right),
        top: lerp(left.transform.crop.top, right.transform.crop.top),
        bottom: lerp(left.transform.crop.bottom, right.transform.crop.bottom),
      }
    }, trackId);
  }

  function mediaTransformAt(clip, timelineTime) {
    const fallback = normalizeTransform(clip?.transform, clip?.trackId || "v1");
    if (!clip || !["video", "image"].includes(clip.type)) return fallback;
    const assetDuration = Math.max(
      clip.sourceOut || 0,
      clip.assetDuration || 0,
      MIN_CLIP_DURATION,
    );
    const keyframes = normalizeMediaKeyframes(clip.keyframes, assetDuration, fallback, clip.trackId);
    if (keyframes.length === 0) return fallback;

    const sourceTime = snapFrameTime(
      clampNumber(
        clip.sourceIn + finiteNumber(Number(timelineTime), clip.start) - clip.start,
        0,
        assetDuration,
      ),
    );
    if (sourceTime <= keyframes[0].time) return keyframes[0].transform;
    const last = keyframes[keyframes.length - 1];
    if (sourceTime >= last.time) return last.transform;
    for (let index = 0; index < keyframes.length - 1; index += 1) {
      const left = keyframes[index];
      const right = keyframes[index + 1];
      if (sourceTime >= left.time && sourceTime <= right.time) {
        const span = Math.max(0.0001, right.time - left.time);
        return interpolateMediaTransform(left, right, (sourceTime - left.time) / span, clip.trackId);
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

  function createAudioAssetClip({ id, asset, start = 0, trackId = "a1" }) {
    if (!id) throw new Error("An audio clip id is required");
    if (!asset?.path || !asset?.name || asset?.type !== "audio") {
      throw new Error("A valid audio asset is required");
    }
    const duration = finiteNumber(asset.duration);
    if (duration <= 0) throw new Error("Audio duration must be known before adding it");
    return {
      id,
      assetPath: asset.path,
      assetName: asset.name,
      type: "audio",
      trackId,
      start: roundTime(Math.max(0, finiteNumber(start))),
      sourceIn: 0,
      sourceOut: roundTime(duration),
      assetDuration: roundTime(duration),
      volume: 1,
      muted: false,
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
    const next = [...clips, { ...clip, start: roundTime(trackEnd(clips, clip.trackId)) }];
    return enforceMagneticV1(next);
  }

  function updateClip(clips, clipId, updater, magnetic = true) {
    const next = clips.map((clip) => (clip.id === clipId ? updater({ ...clip }) : clip));
    return magnetic ? enforceMagneticV1(next) : next;
  }

  function moveClip(clips, clipId, requestedStart, requestedTrackId, magnetic = true) {
    return updateClip(
      clips,
      clipId,
      (clip) => ({
        ...clip,
        trackId: requestedTrackId || clip.trackId,
        start: roundTime(Math.max(0, finiteNumber(requestedStart))),
      }),
      magnetic
    );
  }

  function trimClipLeft(clips, clipId, requestedStart, magnetic = true) {
    return updateClip(clips, clipId, (clip) => {
      const end = clipEnd(clip);
      const earliestStart = clip.trackId === "v1" 
        ? clip.start - clip.sourceIn 
        : Math.max(0, clip.start - clip.sourceIn);
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
    }, magnetic);
  }

  function trimClipRight(clips, clipId, requestedEnd, magnetic = true) {
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
    }, magnetic);
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
    return { clips: enforceMagneticV1(next), rightId: newId };
  }

  function deleteClip(clips, clipId) {
    return enforceMagneticV1(clips.filter((clip) => clip.id !== clipId));
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
        keyframes: normalizeTextKeyframes(
          changes.keyframes ?? clip.keyframes,
          clip.sourceIn + duration,
          { x: changes.x ?? clip.x, y: changes.y ?? clip.y },
        ),
        sourceOut: roundTime(clip.sourceIn + duration),
        assetDuration: roundTime(clip.sourceIn + duration),
      };
    });
  }

  function updateTextClipAtTime(clips, clipId, timelineTime, changes) {
    return updateClip(clips, clipId, (clip) => {
      if (clip.type !== "text") return clip;
      const assetDuration = Math.max(
        clip.sourceOut || 0,
        clip.assetDuration || 0,
        MIN_CLIP_DURATION,
      );
      const sourceTime = snapFrameTime(
        clampNumber(
          clip.sourceIn + finiteNumber(Number(timelineTime), clip.start) - clip.start,
          0,
          assetDuration,
        ),
      );
      const current = textPositionAt(clip, timelineTime);
      const next = {
        x: roundTime(clampNumber(changes.x ?? current.x, 0, 100)),
        y: roundTime(clampNumber(changes.y ?? current.y, 0, 100)),
      };
      const keyframes = normalizeTextKeyframes(clip.keyframes, assetDuration, {
        x: clip.x,
        y: clip.y,
      });
      if (keyframes.length === 0) {
        keyframes.push({
          time: roundTime(clip.sourceIn),
          x: roundTime(clampNumber(clip.x, 0, 100)),
          y: roundTime(clampNumber(clip.y, 0, 100)),
        });
      }
      const existing = keyframes.find((keyframe) => Math.abs(keyframe.time - sourceTime) <= 0.0334);
      if (existing) {
        existing.x = next.x;
        existing.y = next.y;
      } else {
        keyframes.push({ time: sourceTime, ...next });
      }
      return {
        ...clip,
        keyframes: normalizeTextKeyframes(keyframes, assetDuration, next),
      };
    });
  }

  function clearTextKeyframes(clips, clipId, timelineTime) {
    return updateClip(clips, clipId, (clip) => {
      if (clip.type !== "text") return clip;
      const position = textPositionAt(clip, finiteNumber(Number(timelineTime), clip.start));
      return {
        ...clip,
        x: position.x,
        y: position.y,
        keyframes: [],
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

  function updateMediaClipTransformAtTime(clips, clipId, timelineTime, changes) {
    return updateClip(clips, clipId, (clip) => {
      if (!["video", "image"].includes(clip.type)) return clip;
      const current = mediaTransformAt(clip, timelineTime);
      const nextTransform = normalizeTransform(
        {
          ...current,
          ...changes,
          crop: changes.crop ? { ...current.crop, ...changes.crop } : current.crop,
        },
        clip.trackId,
      );

      const assetDuration = Math.max(
        clip.sourceOut || 0,
        clip.assetDuration || 0,
        MIN_CLIP_DURATION,
      );
      const sourceTime = snapFrameTime(
        clampNumber(
          clip.sourceIn + finiteNumber(Number(timelineTime), clip.start) - clip.start,
          0,
          assetDuration,
        ),
      );

      const keyframes = normalizeMediaKeyframes(clip.keyframes, assetDuration, current, clip.trackId);
      if (keyframes.length === 0) {
        keyframes.push({ time: 0, transform: current });
      }

      const existing = keyframes.find((keyframe) => Math.abs(keyframe.time - sourceTime) <= 0.0334);
      if (existing) {
        existing.transform = nextTransform;
      } else {
        keyframes.push({ time: sourceTime, transform: nextTransform });
      }

      return {
        ...clip,
        transform: nextTransform,
        keyframes: normalizeMediaKeyframes(keyframes, assetDuration, current, clip.trackId),
      };
    });
  }

  function removeMediaKeyframeAtTime(clips, clipId, timelineTime) {
    return updateClip(clips, clipId, (clip) => {
      if (!["video", "image"].includes(clip.type)) return clip;
      const assetDuration = Math.max(
        clip.sourceOut || 0,
        clip.assetDuration || 0,
        MIN_CLIP_DURATION,
      );
      const sourceTime = snapFrameTime(
        clampNumber(
          clip.sourceIn + finiteNumber(Number(timelineTime), clip.start) - clip.start,
          0,
          assetDuration,
        ),
      );
      const keyframes = normalizeMediaKeyframes(clip.keyframes, assetDuration, clip.transform, clip.trackId);
      const filtered = keyframes.filter((keyframe) => Math.abs(keyframe.time - sourceTime) > 0.0334);
      return {
        ...clip,
        keyframes: normalizeMediaKeyframes(filtered, assetDuration, clip.transform, clip.trackId),
      };
    });
  }

  function clearMediaKeyframes(clips, clipId, timelineTime) {
    return updateClip(clips, clipId, (clip) => {
      if (!["video", "image"].includes(clip.type)) return clip;
      const currentTransform = mediaTransformAt(clip, timelineTime);
      return {
        ...clip,
        keyframes: [],
        transform: {
          ...clip.transform,
          ...currentTransform,
        },
      };
    });
  }

  function updateClipColorAdjustment(clips, clipId, changes) {
    return updateClip(clips, clipId, (clip) => {
      if (["text", "blur", "audio"].includes(clip.type)) return clip;
      return {
        ...clip,
        colorAdjustment: normalizeColorAdjustment({
          ...normalizeColorAdjustment(clip.colorAdjustment),
          ...changes,
        }),
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
      const sourceTime = snapFrameTime(
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
    FRAME_DURATION,
    FRAME_RATE,
    MIN_CLIP_DURATION,
    appendClip,
    clipDuration,
    clipEnd,
    createAudioClip,
    createAudioAssetClip,
    createBlurClip,
    createClip,
    createTextClip,
    blurEffectAt,
    clearBlurKeyframes,
    clearTextKeyframes,
    deleteClip,
    enforceMagneticV1,
    findClipAt,
    findClipsAt,
    moveClip,
    normalizeColorAdjustment,
    normalizeTransform,
    normalizeBlurEffect,
    normalizeBlurKeyframes,
    normalizeTextKeyframes,
    normalizeMediaKeyframes,
    mediaTransformAt,
    smartSnapTime,
    snapFrameTime,
    snapTime,
    splitClip,
    timelineEnd,
    textPositionAt,
    trackEnd,
    trimClipLeft,
    trimClipRight,
    updateClipTransform,
    updateMediaClipTransformAtTime,
    removeMediaKeyframeAtTime,
    clearMediaKeyframes,
    updateClipColorAdjustment,
    updateAudioClip,
    updateBlurClipAtTime,
    updateBlurClip,
    updateTextClip,
    updateTextClipAtTime,
  });
});
