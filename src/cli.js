#!/usr/bin/env node
"use strict";

const { sanitizeFile } = require("./sanitize");
const { verifyFile } = require("./verify");

function usage() {
  return [
    "Anon Editor Phase 1",
    "",
    "Usage:",
    "  node src/cli.js sanitize <input> <output.mp4> [--force]",
    "  node src/cli.js verify <file.mp4>",
  ].join("\n");
}

async function main(argv) {
  const [command, ...args] = argv;

  if (command === "sanitize") {
    const positional = args.filter((arg) => arg !== "--force");
    if (positional.length !== 2) throw new Error(usage());
    const result = await sanitizeFile(positional[0], positional[1], {
      force: args.includes("--force"),
    });
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
    return;
  }

  if (command === "verify") {
    if (args.length !== 1) throw new Error(usage());
    const result = await verifyFile(args[0]);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 2;
    return;
  }

  throw new Error(usage());
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
