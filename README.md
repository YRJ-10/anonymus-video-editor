# Anon Editor

Anon Editor is a desktop video editor whose export engine rebuilds media without
carrying source metadata into the resulting file.

Development currently covers **Phase 1: the origin-free export engine**.
See [the Phase 1 contract](docs/phase-1-contract.md) for its strict output
allowlist and verification rules.

## Requirements

- Node.js 20 or newer
- FFmpeg and ffprobe on `PATH`

## Try it

```powershell
node src/cli.js sanitize input-video.mp4 anonymous.mp4
node src/cli.js verify anonymous.mp4
node --test test/*.test.js
```
