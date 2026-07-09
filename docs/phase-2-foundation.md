# Phase 2: desktop foundation

Phase 2 turns the Phase 1 engine into the beginning of a desktop application.
It intentionally contains no timeline editing yet.

## Included

- Electron desktop window.
- Native picker for supported local video and photo files.
- Project media list held in memory only.
- Video preview with play, pause, seek, and time display.
- Photo preview.
- Preview zoom from 25% to 400%.
- Pointer-centered mouse-wheel zoom.
- Click-and-drag preview panning.
- Fit/reset control.

## Offline boundary

- Chromium background networking, component updates, domain reliability, and
  synchronization are disabled.
- HTTP, HTTPS, WebSocket, secure WebSocket, and FTP requests are canceled.
- The renderer has no Node.js access.
- Context isolation, sandboxing, and web security are enabled.
- The content security policy disallows all connection requests.
- New windows and external navigation are denied.

The picker exposes only one narrow IPC method to the renderer. It does not
expose filesystem or process APIs.

## Run

```powershell
npm.cmd install
npm.cmd start
```

Use **Add video or photo** or `Ctrl+O` to select local media.

The non-interactive desktop boot check is:

```powershell
npm.cmd run test:desktop:smoke
```
