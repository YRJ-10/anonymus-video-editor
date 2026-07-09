# Phase 4: multi-track overlays and text

Phase 4 expands the V1 timeline into a composited stack of tracks.

## Included

- Add V2, V3, and further tracks.
- Choose the active destination track.
- Add video or photo clips independently to each track.
- Drag a clip vertically to move it between tracks.
- Higher tracks render above lower tracks.
- Video overlays are muted and synchronized to the base video.
- Add text annotations at the playhead.
- Configure text, duration, font size, and color.
- Drag text directly in the preview to set its position.
- Edit text from the preview or selected timeline clip.
- Slice, trim, move, and delete continue to work for every clip type.

V1 is the base track. Tracks above V1 are overlay tracks. Each track appends new
media after the last clip on that same track, rather than after the entire
project.

## Text model

A text clip stores its content, timeline duration, font size, color, and X/Y
position as percentages of the composition area. Position percentages keep the
annotation stable when the preview window is resized.

## Test

```powershell
npm.cmd run test:phase4
npm.cmd run test:desktop:smoke
```
