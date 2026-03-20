# Sable Desktop (Tauri)

Windows desktop port of Sable using Tauri v2.

## Prerequisites

- [Rust](https://rustup.rs/) (stable toolchain)
- Node.js 24.x + pnpm 10.32.1+
- Windows 10/11 SDK (for WASAPI audio capture)

## Development

```bash
# From repo root — install all workspace dependencies
pnpm install

# Start Tauri dev mode (opens native window with hot-reload)
cd platforms/tauri
pnpm run dev
```

## Build

```bash
cd platforms/tauri
pnpm run build
```

Produces `.msi` and `.exe` installers in `src-tauri/target/release/bundle/`.

## Features

### Native Windows Notifications
Uses `tauri-plugin-notification` for Windows toast notifications with full OS integration (action center, Do Not Disturb respect, notification sounds).

### Application Audio Capture
During screen sharing, Sable can capture the application's audio output via WASAPI loopback capture and feed it into the WebRTC call. This allows call participants to hear application audio alongside the screen share.

## Architecture

The Tauri app wraps the same Vite-built web assets as the web version. Platform-specific logic lives in:

- `src-tauri/src/` — Rust backend (audio capture, window management)
- `src/platform/tauri.ts` — Frontend adapter (in the main repo, only loaded in Tauri builds)
