# Phase 11: Strict MP4 Structure

Phase 11 hardens the anonymity verifier by treating the exported MP4 structure
itself as part of the privacy contract.

## What is enforced

- Top-level MP4 boxes must be normalized as `ftyp`, `free`, `mdat`, `moov`.
- The `free` box must be empty and exactly 8 bytes.
- Every parsed box must be inside the approved MP4 hierarchy.
- `dref`, `stsd`, `avc1`, and `mp4a` children are parsed and verified.
- Unknown, duplicate, metadata, and non-normalized boxes are rejected.
- The parser must consume the file exactly to the last byte; even short trailing
  payloads are rejected.

## Why it matters

This prevents a file from passing verification while hiding origin data in an
extra MP4 box, nested metadata area, malformed tail payload, or unexpected sample
description child.

## Tests

Run the Phase 11 verifier checks with:

```bash
npm run test:phase11
```

The full suite also includes these checks:

```bash
npm test
```
