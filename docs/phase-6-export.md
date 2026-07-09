# Phase 6: verified anonymous export

Phase 6 renders the complete timeline and passes the resulting MP4 through the
strict privacy verifier from Phase 1.

## Export profile

- MP4 container.
- Landscape 1920x1080 or portrait 1080x1920.
- 30 fps.
- H.264 High Profile, yuv420p, BT.709.
- AAC stereo at 48 kHz.
- Video/photo layers composited in track order.
- Text annotations rasterized into video pixels.
- Audio from active video clips mixed on the timeline.

## Privacy pipeline

1. Every source clip is decoded.
2. A new 1920x1080 composition is rendered.
3. Only the rendered video and mixed audio streams are mapped to the output.
4. Source metadata, chapters, subtitle, attachment, timecode, and data streams
   are never mapped.
5. H.264 SEI units containing encoder build strings are removed.
6. MP4 `udta`, `meta`, and `ilst` boxes are removed.
7. Container creation/modification timestamps are zero.
8. The strict allowlist verifier inspects streams, tags, boxes, timestamps, and
   forbidden embedded text.
9. The requested output path is published only after verification succeeds.

If encoding or verification fails, the temporary output and support files are
deleted.

## UI

Use **Export** or `Ctrl+E`, select an MP4 destination, and wait for both
rendering and verification to complete. The completion dialog confirms that
source metadata is zero.

## Test

```powershell
npm.cmd run test:phase6
npm.cmd run test:desktop:smoke
```

The end-to-end test deliberately exports a project whose source filename and
metadata contain `SOURCE_SECRET`, then confirms those markers and encoder
identifiers do not exist in the output.
