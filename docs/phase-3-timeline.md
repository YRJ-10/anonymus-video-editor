# Phase 3: timeline editing

Phase 3 introduces the first editable V1 timeline while keeping all Phase 1 and
Phase 2 behavior intact.

## Included

- Add a selected video or photo to V1.
- Sequential clip placement.
- Clickable and draggable playhead.
- Preview synchronization to the playhead.
- Clip selection.
- Drag a clip to move it in time.
- Drag either clip edge to trim source in/out.
- Slice the selected clip at the playhead with the button or `S`.
- Delete the selected clip with the button or `Delete`.
- Timeline zoom from 40 to 240 pixels per second.
- Horizontal timeline scrolling.
- Video playback stops at the selected clip's trimmed end.

Photos receive a five-second default duration. Video duration is read from the
local media element before it can be added to the timeline.

## Data model

Each clip stores:

- Timeline start time.
- Source in and source out time.
- Original asset duration.
- Asset path, name, and type.

Split and trim operations modify these values without altering the source file.
The pure timeline model is independently covered by Node.js tests.

## Test

```powershell
npm.cmd run test:phase3
npm.cmd run test:desktop:smoke
```
