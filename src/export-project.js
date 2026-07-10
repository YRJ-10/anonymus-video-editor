"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { probeFile } = require("./probe");
const { verifyFile } = require("./verify");
const { removeMoovMetadataBoxes } = require("./mp4");
const {
  normalizeBlurEffect,
  normalizeTransform,
} = require("../desktop/renderer/timeline-model");

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
        `${scaleAndFrame},${crop},setsar=1,format=rgba[${layer}]`,
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
    const effect = normalizeBlurEffect(clip.effect);
    const regionWidth = Math.max(
      2,
      Math.round((canvas.width * (effect.width / 100)) / 2) * 2,
    );
    const regionHeight = Math.max(
      2,
      Math.round((canvas.height * (effect.height / 100)) / 2) * 2,
    );
    const x = Math.min(
      canvas.width - regionWidth,
      Math.max(0, Math.round(canvas.width * (effect.x / 100) - regionWidth / 2)),
    );
    const y = Math.min(
      canvas.height - regionHeight,
      Math.max(0, Math.round(canvas.height * (effect.y / 100) - regionHeight / 2)),
    );
    const blurRadius = Math.max(
      1,
      Math.min(effect.strength, Math.floor(Math.min(regionWidth, regionHeight) / 2)),
    );
    const baseLabel = `blurBase${index}`;
    const sourceLabel = `blurSource${index}`;
    const blurredLabel = `blurredRegion${index}`;
    const nextVideo = `blurComposite${index + 1}`;
    filters.push(`[${currentVideo}]split=2[${baseLabel}][${sourceLabel}]`);
    filters.push(
      `[${sourceLabel}]crop=w=${regionWidth}:h=${regionHeight}:x=${x}:y=${y},` +
        `boxblur=luma_radius=${blurRadius}:luma_power=1:` +
        `chroma_radius=${blurRadius}:chroma_power=1[${blurredLabel}]`,
    );
    filters.push(
      `[${baseLabel}][${blurredLabel}]overlay=x=${x}:y=${y}:eof_action=pass:` +
        `shortest=0:enable='between(t,${filterNumber(clip.start)},` +
        `${filterNumber(clipEnd(clip))})'[${nextVideo}]`,
    );
    currentVideo = nextVideo;
  }

  for (let index = 0; index < textClips.length; index += 1) {
    const clip = textClips[index];
    const textFile = path.join(temporaryPaths.supportDirectory, `text-${index}.txt`);
    fs.writeFileSync(textFile, clip.text, "utf8");
    const nextVideo = `textComposite${index + 1}`;
    const x = Math.min(100, Math.max(0, Number(clip.x))) / 100;
    const y = Math.min(100, Math.max(0, Number(clip.y))) / 100;
    const color = /^#[0-9a-f]{6}$/i.test(clip.color)
      ? `0x${clip.color.slice(1)}`
      : "0xFFFFFF";
    filters.push(
      `[${currentVideo}]drawtext=fontfile='${escapeFilterPath(fontFile)}':` +
        `textfile='${escapeFilterPath(textFile)}':reload=0:expansion=none:` +
        `fontsize=${Math.round(Number(clip.fontSize) || 48)}:fontcolor=${color}:` +
        `x=(w-text_w)*${filterNumber(x)}:y=(h-text_h)*${filterNumber(y)}:` +
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
