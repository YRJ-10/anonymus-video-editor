# Phase 14: Adversarial Hardening

Phase 14 closes the remaining practical tamper space around MP4 media payload
layout.

## What is enforced

- Every byte inside `mdat` must belong to a referenced video or audio sample.
- Unreferenced `mdat` payload is rejected, even if it is not readable text.
- Sample ranges must not overlap.
- Tampered sample tables that point two tracks at the same bytes are rejected.

## Why it matters

Earlier phases reject metadata boxes, visible raw strings, SEI user data, and
invalid stream payloads. This phase also blocks opaque binary payloads hidden in
unused `mdat` space.

## Tests

Run the Phase 14 checks with:

```bash
npm run test:phase14
```
