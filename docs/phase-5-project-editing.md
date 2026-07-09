# Phase 5: editing history and local projects

Phase 5 makes editing sessions recoverable and repeatable without introducing
network storage.

## Included

- Copy the selected clip with the button or `Ctrl+C`.
- Paste to the active track at the playhead with the button or `Ctrl+V`.
- Undo up to 100 editing states with the button or `Ctrl+Z`.
- Redo with the button, `Ctrl+Y`, or `Ctrl+Shift+Z`.
- Save a local `.anonproj` file with the button or `Ctrl+S`.
- Open a local project with the button or `Ctrl+Shift+O`.
- Detect and report media files that moved or no longer exist.

History covers asset imports, track creation, adding clips, move, trim, slice,
delete, text creation/editing/position, and paste. Playhead navigation and
timeline zoom do not create noisy history entries.

## Project privacy

The project file is local JSON containing the editing structure and absolute
paths to source media. It is never embedded in an exported video and is ignored
by Git through the `*.anonproj` rule.

Project access is restricted to native open/save dialogs in the Electron main
process. The renderer has no arbitrary filesystem API.

## Test

```powershell
npm.cmd run test:phase5
npm.cmd run test:desktop:smoke
```
