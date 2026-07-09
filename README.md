# Anon Editor

Anon Editor is a desktop video editor whose export engine rebuilds media without
carrying source metadata into the resulting file.

Development currently covers:

- **Phase 1:** the origin-free export engine.
- **Phase 2:** the offline desktop shell and local video/photo preview.
- **Phase 3:** the editable V1 timeline with playhead, move, trim, slice,
  delete, and timeline zoom.
- **Phase 4:** multi-track video/photo overlays and positioned text annotations.
- **Phase 5:** copy/paste, undo/redo, and local `.anonproj` project files.

See [the Phase 1 contract](docs/phase-1-contract.md) for its strict output
allowlist and [the Phase 2 foundation](docs/phase-2-foundation.md) for the
desktop security boundary and preview features. Timeline behavior is documented
in [the Phase 3 timeline](docs/phase-3-timeline.md), with compositing described
in [the Phase 4 overlays](docs/phase-4-overlays.md). Local editing state and
project persistence are covered by
[the Phase 5 project guide](docs/phase-5-project-editing.md).

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
