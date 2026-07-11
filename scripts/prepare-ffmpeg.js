"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, ".build-tools", "ffmpeg");

function findOnPath(command) {
  const lookup = process.platform === "win32" ? "where.exe" : "which";
  try {
    const result = execFileSync(lookup, [command], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return result
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)[0];
  } catch {
    return null;
  }
}

function copyTool(name) {
  const executable = process.platform === "win32" ? `${name}.exe` : name;
  const source = findOnPath(executable) || findOnPath(name);
  if (!source) {
    throw new Error(
      `${name} was not found on PATH. Install FFmpeg first, then run npm run build:win again.`
    );
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const target = path.join(OUT_DIR, process.platform === "win32" ? `${name}.exe` : name);
  fs.copyFileSync(source, target);
  console.log(`Bundled ${name}: ${source}`);
}

copyTool("ffmpeg");
copyTool("ffprobe");
