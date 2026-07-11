"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { probeFile } = require("./probe");
const { verifyFile } = require("./verify");
const { removeMoovMetadataBoxes } = require("./mp4");
const {
  blurEffectAt,
  normalizeBlurEffect,
  normalizeBlurKeyframes,
  normalizeColorAdjustment,
  normalizeTextKeyframes,
  normalizeTransform,
  textPositionAt,
} = require("../desktop/renderer/timeline-model");

const BLUR_TRACKING_SAFETY_PADDING_PX = 8;

const EXPORT_QUALITY_PRESETS = Object.freeze({
  high: Object.freeze({
    id: "high",
    label: "High Quality",
    crf: "20",
    audioBitrate: "192k",
  }),
  balanced: Object.freeze({
    id: "balanced",
    label: "Balanced",
    crf: "24",
    audioBitrate: "128k",
  }),
  small: Object.freeze({
    id: "small",
    label: "Small File",
    crf: "28",
    audioBitrate: "96k",
  }),
});

function exportQualityPreset(value) {
  return EXPORT_QUALITY_PRESETS[value] || EXPORT_QUALITY_PRESETS.balanced;
}

function clipDuration(clip) {
  return Math.max(0, Number(clip.sourceOut) - Number(clip.sourceIn));
}

function clipEnd(clip) {
  return Number(clip.start) + clipDuration(clip);
}

function projectDuration(project) {
  return project.clips.reduce((maximum, clip) => Math.max(maximum, clipEnd(clip)), 0);
}

function filterNumber(value) {
  return Number(value).toFixed(4).replace(/\.?0+$/, "");
}

function clipVolume(clip) {
  if (clip.muted) return 0;
  return Math.min(2, Math.max(0, Number(clip.volume ?? 1)));
}

function colorAdjustmentFilter(clip) {
  const color = normalizeColorAdjustment(clip.colorAdjustment);
  const brightness = filterNumber(color.brightness / 200);
  const contrast = filterNumber(color.contrast / 100);
  const saturation = filterNumber(color.saturation / 100);
  const warmth = filterNumber(color.warmth / 250);
  const filters = [
    `eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}`,
  ];
  if (Math.abs(color.warmth) > 0.001) {
    filters.push(
      `colorbalance=rs=${warmth}:rm=${warmth}:rh=${warmth}:` +
        `bs=${filterNumber(-color.warmth / 250)}:` +
        `bm=${filterNumber(-color.warmth / 250)}:` +
        `bh=${filterNumber(-color.warmth / 250)}`,
    );
  }
  return filters.join(",");
}

function escapeFilterPath(filePath) {
  return filePath
    .replaceAll("\\", "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/,/g, "\\,")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function findSystemFont() {
  const candidates = [
    process.env.WINDIR && path.join(process.env.WINDIR, "Fonts", "arial.ttf"),
    "C:\\Windows\\Fonts\\arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function makeTemporaryPaths(outputPath) {
  const directory = path.dirname(outputPath);
  const base = path.basename(outputPath, path.extname(outputPath));
  const token = crypto.randomBytes(6).toString("hex");
  return {
    output: path.join(directory, `.${base}.render-${process.pid}-${token}.mp4`),
    supportDirectory: path.join(directory, `.anon-export-${process.pid}-${token}`),
  };
}

async function hasAudioStream(filePath, cache) {
  if (!cache.has(filePath)) {
    const probe = await probeFile(filePath);
    cache.set(
      filePath,
      (probe.streams || []).some((stream) => stream.codec_type === "audio"),
    );
  }
  return cache.get(filePath);
}

function makeEvenSpan(value, maximum) {
  const span = Math.max(2, Math.min(maximum, Math.round(value)));
  if (span % 2 === 0) return span;
  return span < maximum ? span + 1 : span - 1;
}

function blurRegionForEffect(canvas, effect, padding = 0) {
  const normalized = normalizeBlurEffect(effect);
  const baseWidth = makeEvenSpan(canvas.width * (normalized.width / 100), canvas.width);
  const baseHeight = makeEvenSpan(canvas.height * (normalized.height / 100), canvas.height);
  const baseX = Math.min(
    canvas.width - baseWidth,
    Math.max(0, Math.round(canvas.width * (normalized.x / 100) - baseWidth / 2)),
  );
  const baseY = Math.min(
    canvas.height - baseHeight,
    Math.max(0, Math.round(canvas.height * (normalized.y / 100) - baseHeight / 2)),
  );
  const left = Math.max(0, baseX - padding);
  const top = Math.max(0, baseY - padding);
  const right = Math.min(canvas.width, baseX + baseWidth + padding);
  const bottom = Math.min(canvas.height, baseY + baseHeight + padding);
  const regionWidth = makeEvenSpan(right - left, canvas.width - left);
  const regionHeight = makeEvenSpan(bottom - top, canvas.height - top);
  return {
    x: left,
    y: top,
    width: regionWidth,
    height: regionHeight,
    strength: Math.max(
      1,
      Math.min(normalized.strength, Math.floor(Math.min(regionWidth, regionHeight) / 2)),
    ),
  };
}

function blurExpression(points, field) {
  if (points.length === 0) return "0";
  const values = points.map((point) => ({
    time: Number(point.time),
    value: Number(point[field]),
  }));
  const build = (index) => {
    const current = values[index];
    if (index === 0) {
      return `if(lte(t\\,${filterNumber(current.time)})\\,${filterNumber(current.value)}\\,${build(index + 1)})`;
    }
    if (index >= values.length - 1) return filterNumber(current.value);
    const next = values[index + 1];
    const span = Math.max(0.0001, next.time - current.time);
    const linear =
      `${filterNumber(current.value)}+(${filterNumber(next.value - current.value)})*` +
      `(t-${filterNumber(current.time)})/${filterNumber(span)}`;
    return `if(lte(t\\,${filterNumber(next.time)})\\,${linear}\\,${build(index + 1)})`;
  };
  return build(0);
}

function textPositionExpression(points, field) {
  if (points.length === 0) return "0";
  const values = points.map((point) => ({
    time: Number(point.time),
    value: Number(point[field]) / 100,
  }));
  const build = (index) => {
    const current = values[index];
    if (index === 0) {
      return `if(lte(t\\,${filterNumber(current.time)})\\,${filterNumber(current.value)}\\,${build(index + 1)})`;
    }
    if (index >= values.length - 1) return filterNumber(current.value);
    const next = values[index + 1];
    const span = Math.max(0.0001, next.time - current.time);
    const linear =
      `${filterNumber(current.value)}+(${filterNumber(next.value - current.value)})*` +
      `(t-${filterNumber(current.time)})/${filterNumber(span)}`;
    return `if(lte(t\\,${filterNumber(next.time)})\\,${linear}\\,${build(index + 1)})`;
  };
  return build(0);
}

function textPositionPointsForClip(clip) {
  const duration = Math.max(clip.sourceOut || 0, clip.assetDuration || 0, clipDuration(clip));
  const sourceStart = Number(clip.sourceIn) || 0;
  const sourceEnd = Number(clip.sourceOut) || sourceStart + clipDuration(clip);
  const keyframes = normalizeTextKeyframes(clip.keyframes, duration, {
    x: clip.x,
    y: clip.y,
  });
  return [
    { time: Number(clip.start), ...textPositionAt(clip, Number(clip.start)) },
    ...keyframes
      .filter((keyframe) => keyframe.time >= sourceStart && keyframe.time <= sourceEnd)
      .map((keyframe) => ({
        time: Number(clip.start) + (keyframe.time - sourceStart),
        x: keyframe.x,
        y: keyframe.y,
      })),
    { time: clipEnd(clip), ...textPositionAt(clip, clipEnd(clip)) },
  ]
    .sort((left, right) => left.time - right.time)
    .filter((point, index, list) => index === 0 || Math.abs(point.time - list[index - 1].time) > 0.0001);
}

function trackedBlurRegionForClip(canvas, clip) {
  const duration = Math.max(clip.sourceOut || 0, clip.assetDuration || 0, clipDuration(clip));
  const keyframes = normalizeBlurKeyframes(clip.keyframes, duration, clip.effect);
  const sourceStart = Number(clip.sourceIn) || 0;
  const sourceEnd = Number(clip.sourceOut) || sourceStart + clipDuration(clip);
  const points = [
    { time: Number(clip.start), effect: blurEffectAt(clip, Number(clip.start)) },
    ...keyframes
      .filter((keyframe) => keyframe.time >= sourceStart && keyframe.time <= sourceEnd)
      .map((keyframe) => ({
        time: Number(clip.start) + (keyframe.time - sourceStart),
        effect: keyframe.effect,
      })),
    { time: clipEnd(clip), effect: blurEffectAt(clip, clipEnd(clip)) },
  ]
    .sort((left, right) => left.time - right.time)
    .filter((point, index, list) => index === 0 || Math.abs(point.time - list[index - 1].time) > 0.0001);
  const baseRegions = points.map((point) =>
    blurRegionForEffect(canvas, point.effect, BLUR_TRACKING_SAFETY_PADDING_PX),
  );
  const width = makeEvenSpan(
    Math.max(...baseRegions.map((region) => region.width)),
    canvas.width,
  );
  const height = makeEvenSpan(
    Math.max(...baseRegions.map((region) => region.height)),
    canvas.height,
  );
  const strength = Math.max(...baseRegions.map((region) => region.strength));
  const positioned = points.map((point) => {
    const effect = normalizeBlurEffect(point.effect);
    const x = Math.min(
      canvas.width - width,
      Math.max(0, Math.round(canvas.width * (effect.x / 100) - width / 2)),
    );
    const y = Math.min(
      canvas.height - height,
      Math.max(0, Math.round(canvas.height * (effect.y / 100) - height / 2)),
    );
    return { time: point.time, x, y };
  });

  return {
    start: Number(clip.start),
    end: clipEnd(clip),
    x: blurExpression(positioned, "x"),
    y: blurExpression(positioned, "y"),
    width,
    height,
    strength,
  };
}

function blurRegionsForClip(canvas, clip) {
  const start = Number(clip.start);
  const end = clipEnd(clip);
  const duration = Math.max(0, end - start);
  if (duration <= 0) return [];
  const hasTracking = Array.isArray(clip.keyframes) && clip.keyframes.length > 1;
  if (hasTracking) return [trackedBlurRegionForClip(canvas, clip)];
  return [
    {
      start,
      end,
      ...blurRegionForEffect(canvas, blurEffectAt(clip, start), 0),
    },
  ];
}

async function buildExportPlan(project, temporaryPaths) {
  const duration = projectDuration(project);
  if (duration <= 0) throw new Error("The timeline is empty");
  const canvas =
    project.canvas?.orientation === "portrait"
      ? { orientation: "portrait", width: 1080, height: 1920 }
      : { orientation: "landscape", width: 1920, height: 1080 };

  const assetByPath = new Map(project.assets.map((asset) => [asset.path, asset]));
  const trackOrder = new Map(project.tracks.map((track, index) => [track.id, index]));
  const visualClips = project.clips
    .filter((clip) => ["video", "image"].includes(clip.type))
    .sort((left, right) => {
      const trackDifference =
        (trackOrder.get(left.trackId) || 0) - (trackOrder.get(right.trackId) || 0);
      return trackDifference || left.start - right.start;
    });
  const textClips = project.clips
    .filter((clip) => clip.type === "text")
    .sort((left, right) => {
      const trackDifference =
        (trackOrder.get(left.trackId) || 0) - (trackOrder.get(right.trackId) || 0);
      return trackDifference || left.start - right.start;
    });
  const blurClips = project.clips
    .filter((clip) => clip.type === "blur")
    .sort((left, right) => {
      const trackDifference =
        (trackOrder.get(left.trackId) || 0) - (trackOrder.get(right.trackId) || 0);
      return trackDifference || left.start - right.start;
    });
  const detachedAudioClips = project.clips
    .filter((clip) => clip.type === "audio")
    .sort((left, right) => left.start - right.start);
  const fontFile = textClips.length > 0 ? findSystemFont() : null;
  if (textClips.length > 0 && !fontFile) {
    throw new Error("No supported system font was found for text rendering");
  }

  fs.mkdirSync(temporaryPaths.supportDirectory, { recursive: true });
  const inputArgs = [];
  const filters = [
    `color=c=black:s=${canvas.width}x${canvas.height}:r=30:` +
      `d=${filterNumber(duration)}[canvas0]`,
  ];
  const audioLabels = [];
  const audioCache = new Map();
  let currentVideo = "canvas0";

  for (let index = 0; index < visualClips.length; index += 1) {
    const clip = visualClips[index];
    const asset = assetByPath.get(clip.assetPath);
    if (!asset) throw new Error(`Missing asset for clip: ${clip.assetName}`);
    if (!fs.existsSync(asset.path)) throw new Error(`Media file is missing: ${asset.path}`);

    const inputIndex = index;
    const clipLength = clipDuration(clip);
    if (asset.type === "image") {
      inputArgs.push(
        "-loop",
        "1",
        "-framerate",
        "30",
        "-t",
        filterNumber(clipLength),
        "-i",
        asset.path,
      );
    } else {
      inputArgs.push(
        "-ss",
        filterNumber(clip.sourceIn),
        "-t",
        filterNumber(clipLength),
        "-i",
        asset.path,
      );
    }

    const layer = `layer${index}`;
    const nextVideo = `composite${index + 1}`;
    const transform = normalizeTransform(clip.transform, clip.trackId);
    const targetWidth = Math.max(2, Math.round((canvas.width * transform.scale) / 2) * 2);
    const targetHeight = Math.max(
      2,
      Math.round((canvas.height * transform.scale) / 2) * 2,
    );
    const horizontalFactor = 1 - transform.crop.left - transform.crop.right;
    const verticalFactor = 1 - transform.crop.top - transform.crop.bottom;
    const scaleAndFrame =
      transform.fitMode === "fill"
        ? `scale=w=${targetWidth}:h=${targetHeight}:` +
          "force_original_aspect_ratio=increase:force_divisible_by=2," +
          `crop=w=${targetWidth}:h=${targetHeight}:x=(iw-${targetWidth})/2:` +
          `y=(ih-${targetHeight})/2`
        : `scale=w=${targetWidth}:h=${targetHeight}:` +
          "force_original_aspect_ratio=decrease:force_divisible_by=2";
    const crop =
      `crop=w='trunc(iw*${filterNumber(horizontalFactor)}/2)*2':` +
      `h='trunc(ih*${filterNumber(verticalFactor)}/2)*2':` +
      `x='trunc(iw*${filterNumber(transform.crop.left)}/2)*2':` +
      `y='trunc(ih*${filterNumber(transform.crop.top)}/2)*2'`;
    const xOffset =
      transform.crop.left === transform.crop.right
        ? "0"
        : `(${filterNumber(transform.crop.left - transform.crop.right)})*` +
          `w/${filterNumber(horizontalFactor)}/2`;
    const yOffset =
      transform.crop.top === transform.crop.bottom
        ? "0"
        : `(${filterNumber(transform.crop.top - transform.crop.bottom)})*` +
          `h/${filterNumber(verticalFactor)}/2`;
    filters.push(
      `[${inputIndex}:v:0]trim=duration=${filterNumber(clipLength)},` +
        `setpts=PTS-STARTPTS+${filterNumber(clip.start)}/TB,fps=30,` +
        `${scaleAndFrame},${crop},${colorAdjustmentFilter(clip)},setsar=1,format=rgba[${layer}]`,
    );
    filters.push(
      `[${currentVideo}][${layer}]overlay=` +
        `x='W*${filterNumber(transform.x / 100)}-w/2+${xOffset}':` +
        `y='H*${filterNumber(transform.y / 100)}-h/2+${yOffset}':` +
        `eof_action=pass:shortest=0:enable='between(t,${filterNumber(clip.start)},` +
        `${filterNumber(clipEnd(clip))})'[${nextVideo}]`,
    );
    currentVideo = nextVideo;

    if (
      asset.type === "video" &&
      !clip.audioDetached &&
      (await hasAudioStream(asset.path, audioCache))
    ) {
      const audioLabel = `audio${index}`;
      const delay = Math.max(0, Math.round(Number(clip.start) * 1000));
      filters.push(
          `[${inputIndex}:a:0]atrim=duration=${filterNumber(clipLength)},` +
          "asetpts=PTS-STARTPTS,aresample=48000," +
          `aformat=sample_rates=48000:channel_layouts=stereo,` +
          `volume=${filterNumber(clipVolume(clip))},` +
          `adelay=delays=${delay}:all=1[${audioLabel}]`,
      );
      audioLabels.push(audioLabel);
    }
  }

  for (let index = 0; index < detachedAudioClips.length; index += 1) {
    const clip = detachedAudioClips[index];
    const asset = assetByPath.get(clip.assetPath);
    if (!asset) throw new Error(`Missing asset for audio clip: ${clip.assetName}`);
    if (!fs.existsSync(asset.path)) throw new Error(`Media file is missing: ${asset.path}`);
    if (!(await hasAudioStream(asset.path, audioCache))) {
      throw new Error(`Audio stream is missing: ${clip.assetName}`);
    }

    const clipLength = clipDuration(clip);
    const inputIndex = visualClips.length + index;
    inputArgs.push(
      "-ss",
      filterNumber(clip.sourceIn),
      "-t",
      filterNumber(clipLength),
      "-i",
      asset.path,
    );
    const audioLabel = `detachedAudio${index}`;
    const delay = Math.max(0, Math.round(Number(clip.start) * 1000));
    filters.push(
      `[${inputIndex}:a:0]atrim=duration=${filterNumber(clipLength)},` +
        "asetpts=PTS-STARTPTS,aresample=48000," +
        "aformat=sample_rates=48000:channel_layouts=stereo," +
        `volume=${filterNumber(clipVolume(clip))},` +
        `adelay=delays=${delay}:all=1[${audioLabel}]`,
    );
    audioLabels.push(audioLabel);
  }

  for (let index = 0; index < blurClips.length; index += 1) {
    const clip = blurClips[index];
    const regions = blurRegionsForClip(canvas, clip);
    for (let regionIndex = 0; regionIndex < regions.length; regionIndex += 1) {
      const region = regions[regionIndex];
      const label = `${index}_${regionIndex}`;
      const baseLabel = `blurBase${label}`;
      const sourceLabel = `blurSource${label}`;
      const blurredLabel = `blurredRegion${label}`;
      const nextVideo = `blurComposite${label}`;
      filters.push(`[${currentVideo}]split=2[${baseLabel}][${sourceLabel}]`);
      filters.push(
        `[${sourceLabel}]crop=w=${region.width}:h=${region.height}:` +
          `x='${region.x}':y='${region.y}',` +
          `boxblur=luma_radius=${region.strength}:luma_power=1:` +
          `chroma_radius=${region.strength}:chroma_power=1[${blurredLabel}]`,
      );
      filters.push(
        `[${baseLabel}][${blurredLabel}]overlay=x='${region.x}':y='${region.y}':` +
          `eof_action=pass:shortest=0:enable='between(t,${filterNumber(region.start)},` +
          `${filterNumber(region.end)})'[${nextVideo}]`,
      );
      currentVideo = nextVideo;
    }
  }

  for (let index = 0; index < textClips.length; index += 1) {
    const clip = textClips[index];
    const textFile = path.join(temporaryPaths.supportDirectory, `text-${index}.txt`);
    fs.writeFileSync(textFile, clip.text, "utf8");
    const nextVideo = `textComposite${index + 1}`;
    const points = textPositionPointsForClip(clip);
    const x = textPositionExpression(points, "x");
    const y = textPositionExpression(points, "y");
    const color = /^#[0-9a-f]{6}$/i.test(clip.color)
      ? `0x${clip.color.slice(1)}`
      : "0xFFFFFF";
    filters.push(
      `[${currentVideo}]drawtext=fontfile='${escapeFilterPath(fontFile)}':` +
        `textfile='${escapeFilterPath(textFile)}':reload=0:expansion=none:` +
        `fontsize=${Math.round(Number(clip.fontSize) || 48)}:fontcolor=${color}:` +
        `x=(w-text_w)*(${x}):y=(h-text_h)*(${y}):` +
        `enable='between(t,${filterNumber(clip.start)},${filterNumber(clipEnd(clip))})'` +
        `[${nextVideo}]`,
    );
    currentVideo = nextVideo;
  }

  filters.push(
    `[${currentVideo}]trim=duration=${filterNumber(duration)},fps=30,format=yuv420p,` +
      "setparams=range=limited:color_primaries=bt709:color_trc=bt709:" +
      "colorspace=bt709[vout]",
  );

  if (audioLabels.length > 0) {
    filters.push(
      `${audioLabels.map((label) => `[${label}]`).join("")}` +
        `amix=inputs=${audioLabels.length}:duration=longest:dropout_transition=0:` +
        `normalize=0,alimiter=limit=0.95,apad,atrim=duration=${filterNumber(duration)}[aout]`,
    );
  } else {
    filters.push(
      `anullsrc=channel_layout=stereo:sample_rate=48000,` +
        `atrim=duration=${filterNumber(duration)}[aout]`,
    );
  }

  return {
    canvas,
    duration,
    filterGraph: filters.join(";"),
    inputArgs,
  };
}

function runFfmpeg(args, duration, onProgress) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let progressBuffer = "";
    let errorOutput = "";

    child.stdout.on("data", (chunk) => {
      progressBuffer += chunk.toString("utf8");
      const lines = progressBuffer.split(/\r?\n/);
      progressBuffer = lines.pop() || "";
      for (const line of lines) {
        const [key, rawValue] = line.split("=", 2);
        if (key === "out_time_us") {
          const seconds = Number(rawValue) / 1_000_000;
          onProgress?.(Math.min(0.99, Math.max(0, seconds / duration)));
        } else if (key === "progress" && rawValue === "end") {
          onProgress?.(1);
        }
      }
    });

    child.stderr.on("data", (chunk) => {
      if (errorOutput.length < 2 * 1024 * 1024) errorOutput += chunk.toString("utf8");
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg export failed${errorOutput.trim() ? `: ${errorOutput.trim()}` : ""}`));
    });
  });
}

async function exportProject(project, outputPath, options = {}) {
  const output = path.resolve(outputPath);
  if (path.extname(output).toLowerCase() !== ".mp4") {
    throw new Error("Export output must use the .mp4 extension");
  }
  if (fs.existsSync(output) && !options.force) {
    throw new Error(`Output already exists: ${output}`);
  }

  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temporaryPaths = makeTemporaryPaths(output);
  const plan = await buildExportPlan(project, temporaryPaths);
  const quality = exportQualityPreset(options.quality);
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    ...plan.inputArgs,
    "-filter_complex",
    plan.filterGraph,
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-map_metadata",
    "-1",
    "-map_metadata:s",
    "-1",
    "-map_chapters",
    "-1",
    "-sn",
    "-dn",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    quality.crf,
    "-pix_fmt",
    "yuv420p",
    "-profile:v",
    "high",
    "-level:v",
    "4.1",
    "-flags:v",
    "+bitexact",
    "-bsf:v",
    "filter_units=remove_types=6",
    "-color_range",
    "tv",
    "-colorspace",
    "bt709",
    "-color_trc",
    "bt709",
    "-color_primaries",
    "bt709",
    "-c:a",
    "aac",
    "-b:a",
    quality.audioBitrate,
    "-ar",
    "48000",
    "-ac",
    "2",
    "-flags:a",
    "+bitexact",
    "-metadata",
    "encoder=",
    "-metadata",
    "creation_time=",
    "-metadata:s:v:0",
    "language=und",
    "-metadata:s:v:0",
    "handler_name=VideoHandler",
    "-metadata:s:v:0",
    "vendor_id=[0][0][0][0]",
    "-metadata:s:v:0",
    "encoder=",
    "-metadata:s:a:0",
    "language=und",
    "-metadata:s:a:0",
    "handler_name=SoundHandler",
    "-metadata:s:a:0",
    "vendor_id=[0][0][0][0]",
    "-metadata:s:a:0",
    "encoder=",
    "-brand",
    "isom",
    "-fflags",
    "+bitexact",
    "-t",
    filterNumber(plan.duration),
    "-progress",
    "pipe:1",
    "-nostats",
    temporaryPaths.output,
  ];

  try {
    await runFfmpeg(args, plan.duration, options.onProgress);
    removeMoovMetadataBoxes(temporaryPaths.output);
    const verification = await verifyFile(temporaryPaths.output, {
      width: plan.canvas.width,
      height: plan.canvas.height,
    });
    if (!verification.ok) {
      throw new Error(`Export failed privacy verification:\n- ${verification.issues.join("\n- ")}`);
    }
    if (fs.existsSync(output)) fs.rmSync(output, { force: true });
    fs.renameSync(temporaryPaths.output, output);
    return {
      output,
      duration: plan.duration,
      quality: quality.id,
      verification: { ...verification, file: output },
    };
  } finally {
    if (fs.existsSync(temporaryPaths.output)) {
      fs.rmSync(temporaryPaths.output, { force: true });
    }
    const supportRoot = path.resolve(temporaryPaths.supportDirectory);
    const outputRoot = path.resolve(path.dirname(output));
    if (supportRoot.startsWith(`${outputRoot}${path.sep}`) && fs.existsSync(supportRoot)) {
      fs.rmSync(supportRoot, { recursive: true, force: true });
    }
  }
}

module.exports = {
  buildExportPlan,
  escapeFilterPath,
  exportProject,
  exportQualityPreset,
  findSystemFont,
  projectDuration,
};
