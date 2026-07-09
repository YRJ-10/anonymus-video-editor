# Anon Editor

Anon Editor is a desktop video editor whose export engine rebuilds media without
carrying source metadata into the resulting file.

Development currently covers:

- **Phase 1:** the origin-free export engine.
- **Phase 2:** the offline desktop shell and local video/photo preview.

See [the Phase 1 contract](docs/phase-1-contract.md) for its strict output
allowlist and [the Phase 2 foundation](docs/phase-2-foundation.md) for the
desktop security boundary and preview features.

## Requirements

- Node.js 20 or newer
- FFmpeg and ffprobe on `PATH`
- Electron (installed through npm)

## Desktop app

```powershell
npm.cmd install
npm.cmd start
```

## Phase 1 command line

```powershell
node src/cli.js sanitize input-video.mp4 anonymous.mp4
node src/cli.js verify anonymous.mp4
node --test test/*.test.js
```
