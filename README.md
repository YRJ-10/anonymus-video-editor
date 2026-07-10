# Anon Editor

Anon Editor is a compact desktop video editor that rebuilds exports as verified,
origin-free MP4 files. It supports local media, multi-track editing, text,
transform controls, detached audio, and 1080p landscape or portrait export.

## Screenshot

![Anon Editor interface](./anon-editor-screenshot.png)

## Architecture

Anon Editor is an offline Electron desktop app. The editing UI runs in the
renderer process, while file access, project IO, export, and privacy
verification run in the local Node/Electron main process.

- **Desktop shell:** Electron main process in `desktop/main.js`.
- **UI layer:** HTML/CSS/vanilla JavaScript in `desktop/renderer/`.
- **Timeline model:** local timeline, clips, tracks, snapping, transforms, text,
  audio, blur/sensor effects, and frame stepping in
  `desktop/renderer/timeline-model.js`.
- **Project files:** local `.anonproj` JSON serialization in
  `desktop/project-file.js`.
- **Media probing:** `ffprobe` wrappers in `src/probe.js`.
- **Export engine:** FFmpeg timeline rebuild in `src/export-project.js`.
- **Sanitizer/CLI:** standalone MP4 sanitizing flow in `src/sanitize.js` and
  `src/cli.js`.
- **Privacy verifier:** strict file inspection in `src/verify.js`,
  `src/raw-verify.js`, and `src/mp4.js`.

There is no app backend, cloud renderer, account system, telemetry pipeline, or
remote project storage. Media is read from local disk, rendered locally, checked
locally, and only then published as the selected output file.

## File anonymity

Anon Editor targets **file-level anonymity**: the exported MP4 should not carry
source metadata, editor metadata, user paths, device traces, location traces, or
project identifiers inside the file.

Exports are not stream-copied. The timeline is decoded, composited, and
re-encoded into a new normalized MP4. During that rebuild, Anon Editor removes
or refuses:

- Source container metadata and stream metadata (`title`, `artist`, `comment`,
  `copyright`, `description`, `encoded_by`, `encoder`, `creation_time`, and
  similar tags).
- Source chapters, programs, subtitle streams, data streams, attachments, and
  extra non-audio/video streams.
- Device/camera/software traces, including device model, camera model, software
  labels, FFmpeg/Lavf/x264 signatures, and QuickTime/iTunes metadata namespaces.
- Location/GPS traces, including contextual `location`, `gps`, `GPSLatitude`,
  and `GPSLongitude` style metadata keys.
- User-identifying filesystem text, including Windows user paths, Unix/macOS
  user paths, URLs, and email addresses found as embedded text.
- MP4 metadata boxes that commonly carry private data, including `uuid`,
  `udta`, `meta`, `ilst`, and `keys`.
- Non-zero MP4 creation/modification timestamps.
- H.264 SEI user-data units and unwanted audio/video side data.
- Any unique Anon Editor export ID, project marker, hidden watermark, or custom
  tracking tag.

Only minimal normalized technical fields required for playback are allowed to
remain, such as MP4 brand compatibility, one H.264 video stream, optional AAC
audio, normalized handler names, undefined language (`und`), pixel format, color
space, frame rate, and dimensions.

Every export is first written to a temporary file. The final output is published
only if the strict verifier passes the container scan, raw text scan, MP4 box
scan, timestamp scan, stream validation, and bitstream validation.

## Technical specifications

- Output: MP4, H.264 High 4.1, 30 FPS, YUV420p, BT.709
- Canvas: 1920x1080 landscape or 1080x1920 portrait
- Export presets: High Quality, Balanced, and Small File, all verified as
  anonymous MP4 output
- Audio: AAC, 48 kHz stereo, one normalized output stream
- Timeline: up to 100 video/audio tracks and 100,000 clips
- Editing: slice, trim, move, overlays, text, crop, Fit/Fill, volume, mute,
  detached audio, undo/redo, copy/paste, and timeline snapping
- Projects: local `.anonproj` files, up to 10 MB

Anon Editor is intended for short-form editing; practical media limits depend on
available CPU, memory, storage, and source complexity.

## Clone and run

Requirements: Git, Node.js 20+, and FFmpeg/ffprobe available on `PATH`.

```bash
git clone https://github.com/YRJ-10/anonymus-video-editor.git
cd anonymus-video-editor
npm install
npm start
```

Run the test suite with:

```bash
npm test
```
