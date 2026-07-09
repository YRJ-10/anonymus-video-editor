"use strict";

const { runProcess } = require("./process");

async function probeFile(filePath) {
  const result = await runProcess("ffprobe", [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    "-show_chapters",
    "-show_programs",
    filePath,
  ]);

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`ffprobe returned invalid JSON: ${error.message}`);
  }
}

module.exports = { probeFile };
