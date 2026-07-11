"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function bundledMediaTool(command) {
  const baseName = path.basename(command).toLowerCase();
  const normalized =
    baseName === "ffmpeg" || baseName === "ffmpeg.exe"
      ? "ffmpeg.exe"
      : baseName === "ffprobe" || baseName === "ffprobe.exe"
        ? "ffprobe.exe"
        : null;

  if (!normalized) return command;

  const candidates = [];
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, "tools", normalized));
  }
  candidates.push(path.join(__dirname, "..", ".build-tools", "ffmpeg", normalized));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return command;
}

function runProcess(command, args, options = {}) {
  const { cwd, maxOutputBytes = 8 * 1024 * 1024 } = options;
  const executable = bundledMediaTool(command);

  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdout = [];
    const stderr = [];
    let outputBytes = 0;

    const collect = (target) => (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) {
        child.kill();
        reject(new Error(`${command} produced more than ${maxOutputBytes} bytes of output`));
        return;
      }
      target.push(chunk);
    };

    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));

    child.on("error", (error) => {
      if (error.code === "ENOENT") {
        reject(new Error(`${command} was not found in the app bundle or on PATH`));
        return;
      }
      reject(error);
    });

    child.on("close", (code) => {
      const result = {
        code,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };

      if (code !== 0) {
        const detail = result.stderr.trim() || result.stdout.trim();
        reject(new Error(`${command} exited with code ${code}${detail ? `: ${detail}` : ""}`));
        return;
      }

      resolve(result);
    });
  });
}

module.exports = { runProcess };
