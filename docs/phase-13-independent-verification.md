# Phase 13: Independent Raw Verification

Phase 13 adds a second verification path that does not depend on the MP4 parser.
It scans the exported file as raw bytes.

## What is enforced

- Printable ASCII strings are extracted and scanned.
- UTF-16LE strings are extracted and scanned.
- Source markers, tool signatures, metadata keys, paths, URLs, emails, GPS/location
  terms, and encoder labels are rejected.
- Forbidden MP4 box signatures such as `uuid`, `udta`, `meta`, `ilst`, and `keys`
  are also searched at the byte level.

## Why it matters

If origin data is hidden inside compressed media payload or malformed areas that
a normal MP4 walk might not expose as metadata, the raw verifier can still catch
the byte-level trace.

## Tests

Run the Phase 13 checks with:

```bash
npm run test:phase13
```
