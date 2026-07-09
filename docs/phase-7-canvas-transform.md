# Phase 7: canvas orientation and clip transforms

Phase 7 introduces project-level orientation plus non-destructive visual
transforms for every video and photo clip.

## Canvas detection

The first imported visual asset determines the initial canvas:

- Width greater than or equal to height: Landscape 16:9, 1920x1080.
- Height greater than width: Portrait 9:16, 1080x1920.

Display dimensions account for quarter-turn rotation. Once selected, later
assets do not change the project canvas. The user can switch between 16:9 and
9:16 at any time from the preview toolbar.

Canvas orientation is stored in project files, participates in undo/redo, and
controls both preview geometry and verified export dimensions.

## Clip transforms

Each video/photo clip stores:

- X and Y position as canvas percentages.
- Uniform scale from 5% to 400%.
- Fit or Fill mode.
- Non-destructive crop percentages for all four edges.

V1 clips begin fitted at 100%. Clips added to overlay tracks begin fitted at
50%. Select an active media clip to show its transform bounds:

- Drag the bounds to move it.
- Drag a corner to resize it.
- Use **Fit** to preserve and show the entire frame.
- Use **Fill** to cover the transform frame.
- Use **Crop** to hide selected source edges.
- Use **Reset** to restore the track default.

Transforms are stored as normalized values so they remain stable when the
window or project orientation changes.

## Export parity

The FFmpeg renderer consumes the same canvas, position, scale, Fit/Fill, and
crop values used by the preview. The verifier expects 1920x1080 for landscape
projects and 1080x1920 for portrait projects.

## Test

```powershell
npm.cmd run test:phase7
npm.cmd run test:desktop:smoke
```

The portrait integration test exports a transformed and cropped clip at
1080x1920 and requires it to pass the same privacy verifier as landscape
exports.
