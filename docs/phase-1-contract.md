# Phase 1 contract: origin-free MP4

Phase 1 proves that Anon Editor can rebuild an input file without carrying source
metadata into the exported file.

## Output allowlist

The output is accepted only when all of these rules pass:

- MP4 container with exactly one H.264 video stream.
- Zero or one AAC audio stream.
- No subtitle, data, attachment, cover-art, chapter, or program stream.
- Video normalized to 1920x1080, 30 fps, yuv420p, BT.709.
- Audio, when present, normalized to AAC stereo at 48 kHz.
- Container tags limited to fixed MP4 brand declarations.
- Stream tags limited to fixed language, handler, and zero vendor declarations.
- No encoder, source filename, creation time, location, device, author, title,
  comment, project, or session tag.
- MP4 creation and modification timestamps are zero.
- No `uuid`, `udta`, `meta`, or `ilst` box.
- No H.264 SEI NAL units; this prevents the encoder build string from being
  embedded in the video stream.

FFmpeg may create an MP4 `udta` metadata box even when metadata values are
empty. The engine therefore writes media data before `moov`, removes `udta`
from `moov`, adjusts the box size, and verifies the resulting structure. Since
the media data precedes `moov`, this normalization does not invalidate sample
offsets.

The sanitizer writes to a temporary file, verifies it, and only then moves it
to the requested output path. A failed verification never publishes the file.

## Commands

```powershell
node src/cli.js sanitize input.mkv anonymous.mp4
node src/cli.js verify anonymous.mp4
```

`sanitize` refuses to replace an existing file unless `--force` is supplied.

## Current scope

This phase intentionally targets one canonical export profile. Editing and
additional export presets are later phases. FFmpeg and ffprobe must be
available on `PATH`; the implementation has no npm dependencies.
