"use strict";

const path = require("node:path");
const { probeFile } = require("./probe");
const { inspectMp4 } = require("./mp4");

const FORMAT_TAG_RULES = Object.freeze({
  major_brand: new Set(["isom"]),
  minor_version: new Set(["512"]),
  compatible_brands: new Set(["isomiso2avc1mp41"]),
});

const STREAM_TAG_KEYS = new Set(["language", "handler_name", "vendor_id"]);
const FORBIDDEN_TEXT_PATTERNS = [
  /\bLavf\d/i,
  /\bFFmpeg\b/i,
  /\bx264\b/i,
  /\bcreation_time\b/i,
  /\blocation\b/i,
  /\bdevice[_ -]?model\b/i,
  /\bSOURCE_SECRET\b/i,
];
const FORBIDDEN_BOXES = new Set(["uuid", "udta", "meta", "ilst"]);

function pushUnexpectedTags(issues, scope, tags, allowedRules) {
  for (const [key, value] of Object.entries(tags || {})) {
    if (!Object.hasOwn(allowedRules, key)) {
      issues.push(`${scope} contains forbidden tag ${key}`);
      continue;
    }
    if (!allowedRules[key].has(String(value))) {
      issues.push(`${scope} tag ${key} has non-normalized value ${JSON.stringify(value)}`);
    }
  }
}

function checkStreamTags(issues, stream, expectedHandler) {
  for (const [key, value] of Object.entries(stream.tags || {})) {
    if (!STREAM_TAG_KEYS.has(key)) {
      issues.push(`stream ${stream.index} contains forbidden tag ${key}`);
      continue;
    }

    if (key === "language" && value !== "und") {
      issues.push(`stream ${stream.index} language must be und`);
    }
    if (key === "handler_name" && value !== expectedHandler) {
      issues.push(`stream ${stream.index} handler_name is not normalized`);
    }
    if (key === "vendor_id" && value !== "[0][0][0][0]") {
      issues.push(`stream ${stream.index} vendor_id is not normalized`);
    }
  }
}

async function verifyFile(filePath) {
  const issues = [];
  const resolvedPath = path.resolve(filePath);
  let probe;
  let mp4;

  try {
    probe = await probeFile(resolvedPath);
  } catch (error) {
    return { ok: false, file: resolvedPath, issues: [`Probe failed: ${error.message}`] };
  }

  const formatName = probe.format?.format_name || "";
  if (!formatName.split(",").includes("mp4")) {
    issues.push(`output container must be MP4, got ${formatName || "unknown"}`);
  }

  pushUnexpectedTags(issues, "format", probe.format?.tags, FORMAT_TAG_RULES);

  const streams = probe.streams || [];
  const videoStreams = streams.filter((stream) => stream.codec_type === "video");
  const audioStreams = streams.filter((stream) => stream.codec_type === "audio");
  const forbiddenStreams = streams.filter(
    (stream) => !["video", "audio"].includes(stream.codec_type),
  );

  if (videoStreams.length !== 1) {
    issues.push(`exactly one video stream is required, found ${videoStreams.length}`);
  }
  if (audioStreams.length > 1) {
    issues.push(`at most one audio stream is allowed, found ${audioStreams.length}`);
  }
  if (forbiddenStreams.length > 0) {
    issues.push(
      `forbidden streams found: ${forbiddenStreams.map((stream) => stream.codec_type).join(", ")}`,
    );
  }
  if ((probe.chapters || []).length > 0) issues.push("chapters are forbidden");
  if ((probe.programs || []).length > 0) issues.push("programs are forbidden");

  for (const stream of videoStreams) {
    checkStreamTags(issues, stream, "VideoHandler");
    if (stream.codec_name !== "h264") issues.push("video codec must be H.264");
    if (stream.width !== 1920 || stream.height !== 1080) {
      issues.push(`video dimensions must be normalized to 1920x1080`);
    }
    if (stream.pix_fmt !== "yuv420p") issues.push("video pixel format must be yuv420p");
    if (stream.avg_frame_rate !== "30/1") issues.push("video frame rate must be 30 fps");
    if (stream.color_space !== "bt709") issues.push("video color space must be bt709");
    if (stream.color_transfer !== "bt709") issues.push("video transfer must be bt709");
    if (stream.color_primaries !== "bt709") issues.push("video primaries must be bt709");
    if ((stream.side_data_list || []).length > 0) {
      issues.push(`video stream ${stream.index} contains side data`);
    }
  }

  for (const stream of audioStreams) {
    checkStreamTags(issues, stream, "SoundHandler");
    if (stream.codec_name !== "aac") issues.push("audio codec must be AAC");
    if (stream.sample_rate !== "48000") issues.push("audio sample rate must be 48000 Hz");
    if (stream.channels !== 2) issues.push("audio must be stereo");
    if ((stream.side_data_list || []).length > 0) {
      issues.push(`audio stream ${stream.index} contains side data`);
    }
  }

  try {
    mp4 = inspectMp4(resolvedPath);
    const topLevelTypes = new Set(
      mp4.boxes.filter((box) => !box.path.includes(".")).map((box) => box.type),
    );
    for (const required of ["ftyp", "moov", "mdat"]) {
      if (!topLevelTypes.has(required)) issues.push(`required MP4 box ${required} is missing`);
    }

    for (const box of mp4.boxes) {
      if (FORBIDDEN_BOXES.has(box.type)) {
        issues.push(`forbidden MP4 box found at ${box.path}`);
      }
    }

    for (const timestamp of mp4.timestamps) {
      if (timestamp.creation !== 0n || timestamp.modification !== 0n) {
        issues.push(`non-zero creation/modification timestamp found at ${timestamp.path}`);
      }
    }

    const latinText = mp4.buffer.toString("latin1");
    for (const pattern of FORBIDDEN_TEXT_PATTERNS) {
      if (pattern.test(latinText)) {
        issues.push(`forbidden embedded text matched ${pattern}`);
      }
    }
  } catch (error) {
    issues.push(`MP4 structure inspection failed: ${error.message}`);
  }

  return {
    ok: issues.length === 0,
    file: resolvedPath,
    issues,
    summary: {
      videoStreams: videoStreams.length,
      audioStreams: audioStreams.length,
      chapters: (probe.chapters || []).length,
      tags: Object.keys(probe.format?.tags || {}).length,
      inspectedBoxes: mp4?.boxes.length || 0,
    },
  };
}

module.exports = { verifyFile };
