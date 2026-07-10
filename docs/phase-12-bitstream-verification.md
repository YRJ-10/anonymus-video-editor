# Phase 12: Bitstream Verification

Phase 12 hardens verification inside the MP4 media payload, not only the MP4 box
tree.

## What is enforced

- MP4 sample tables are read from `stsz`, `stsc`, `stco`, and `co64`.
- Every referenced video/audio sample must point inside `mdat`.
- H.264 samples must use normalized length-prefixed AVC NAL units.
- H.264 SEI NAL units are rejected because they can carry user data.
- Non-normalized H.264 NAL types are rejected.
- MP4 AAC samples must not contain ADTS or ID3 headers.

## Why it matters

This blocks origin data from being hidden in the compressed media payload after
container metadata has already been stripped.

## Tests

Run the Phase 12 checks with:

```bash
npm run test:phase12
```
