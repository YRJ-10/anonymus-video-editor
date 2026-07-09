"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { runProcess } = require("./process");
const { probeFile } = require("./probe");
const { verifyFile } = require("./verify");
const { removeMoovMetadataBoxes } = require("./mp4");

function makeTemporaryOutput(outputPath) {
  const directory = path.dirname(outputPath);
  const base = path.basename(outputPath, path.extname(outputPath));
  const token = crypto.randomBytes(6).toString("hex");
  return path.join(directory, `.${base}.anon-${process.pid}-${token}.mp4`);
}

async function sanitizeFile(inputPath, outputPath, options = {}) {
  const input = path.resolve(inputPath);
  const output = path.resolve(outputPath);
  const force = options.force === true;

  if (!fs.existsSync(input)) throw new Error(`Input does not exist: ${input}`);
  if (path.extname(output).toLowerCase() !== ".mp4") {
    throw new Error("Phase 1 output must use the .mp4 extension");
  }
  if (input === output) throw new Error("Input and output paths must be different");
  if (fs.existsSync(output) && !force) {
    throw new Error(`Output already exists: ${output}. Use --force to replace it.`);
  }

  fs.mkdirSync(path.dirname(output), { recursive: true });
  const inputProbe = await probeFile(input);
  const streams = inputProbe.streams || [];
  if (!streams.some((stream) => stream.codec_type === "video")) {
    throw new Error("Input has no video stream");
  }
  const hasAudio = streams.some((stream) => stream.codec_type === "audio");
  const temporaryOutput = makeTemporaryOutput(output);

  const videoFilter = [
    "scale=1920:1080:force_original_aspect_ratio=decrease:force_divisible_by=2",
    "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black",
    "setsar=1",
    "fps=30",
    "format=yuv420p",
    "setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709",
  ].join(",");

  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    input,
    "-map",
    "0:v:0",
  ];

  if (hasAudio) args.push("-map", "0:a:0");

  args.push(
    "-map_metadata",
    "-1",
    "-map_metadata:s",
    "-1",
    "-map_chapters",
    "-1",
    "-sn",
    "-dn",
    "-vf",
    videoFilter,
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "20",
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
  );

  if (hasAudio) {
    args.push(
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-flags:a",
      "+bitexact",
    );
  }

  args.push(
    "-map_metadata",
    "-1",
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
  );

  if (hasAudio) {
    args.push(
      "-metadata:s:a:0",
      "language=und",
      "-metadata:s:a:0",
      "handler_name=SoundHandler",
      "-metadata:s:a:0",
      "vendor_id=[0][0][0][0]",
      "-metadata:s:a:0",
      "encoder=",
    );
  }

  args.push("-brand", "isom", "-fflags", "+bitexact", temporaryOutput);

  try {
    await runProcess("ffmpeg", args, { maxOutputBytes: 16 * 1024 * 1024 });
    removeMoovMetadataBoxes(temporaryOutput);
    const verification = await verifyFile(temporaryOutput);
    if (!verification.ok) {
      throw new Error(`Sanitized output failed verification:\n- ${verification.issues.join("\n- ")}`);
    }

    if (fs.existsSync(output)) fs.rmSync(output, { force: true });
    fs.renameSync(temporaryOutput, output);
    return { input, output, verification: { ...verification, file: output } };
  } finally {
    if (fs.existsSync(temporaryOutput)) fs.rmSync(temporaryOutput, { force: true });
  }
}

module.exports = { sanitizeFile };
