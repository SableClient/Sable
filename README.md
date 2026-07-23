# Sable

A Matrix client built to enhance the user experience with quality-of-life features, cosmetics, utilities, and sheer usability. See the [changelog](https://github.com/SableClient/Sable/blob/dev/CHANGELOG.md).

Soon to be replaced desktop apps can be downloaded [here](https://github.com/7w1/sable/releases/tag/1.0.0). They auto-update by pulling the website.

Join our matrix space [here](https://matrix.to/#/#sable:sable.moe) to discuss features, issues, or meowing.

Forked from [Cinny](https://github.com/cinnyapp/cinny/).

## Getting started
The stable web app is available at [app.sable.moe](https://app.sable.moe/) and tracks the [latest GitHub release](https://github.com/SableClient/Sable/releases/latest). Nightly builds are available at [dev.sable.moe](https://dev.sable.moe/) and from the [`nightly` GitHub release](https://github.com/SableClient/Sable/releases/tag/nightly).

You can also download our desktop app for Windows and Linux from [releases](https://github.com/SableClient/Sable/releases/latest). Release artifacts include build attestations, and desktop installations update automatically.

## iOS (AltStore / SideStore)

Sable iOS builds are distributed as unsigned IPAs through [AltStore](https://altstore.io) and [SideStore](https://sidestore.io). The nightly build publishes both the IPA and an `altstore-source.json` manifest to the [`nightly` GitHub release](https://github.com/SableClient/Sable/releases/tag/nightly).

To install:

1. Set up [AltStore Classic](https://faq.altstore.io/altstore-classic/altserver) or [SideStore](https://docs.sidestore.io) on your device.
2. Add the Sable source:
   - AltStore: `altstore://source?url=https://github.com/SableClient/Sable/releases/download/nightly/altstore-source.json`
   - SideStore: `sidestore://source?url=https://github.com/SableClient/Sable/releases/download/nightly/altstore-source.json`
3. Install Sable from the source. The IPA is unsigned; AltStore/SideStore re-sign it with your personal development certificate at install time, so apps refresh every 7 days (the standard free-account limitation).

iOS builds are produced by the `ios` job in [`tauri-build.yml`](.github/workflows/tauri-build.yml) and track the same `dev`/`v*` triggers as desktop builds.

## Self-hosting
You have a few options for self hosting, you can:
1. Run the prebuilt docker container.
2. Deploy on a site like GitLab Pages. Jae has a [guide here](https://docs.j4.lc/Tutorials/Deploying-Sable-on-GitLab-Pages).
3. Build it yourself.

### Docker

Prebuilt images are published to `ghcr.io/sableclient/sable`.

- `latest` tracks the current `dev` branch image.
- `X.Y.Z` tags are versioned releases.
- `X.Y` tags float within a release line.
- Pushes to `dev` also publish a short commit SHA tag.

Run the latest image with:

```sh
docker run --rm -p 8080:8080 ghcr.io/sableclient/sable:latest
```

Then open `http://localhost:8080`.

If you want to override the bundled [`config.json`](config.json), mount your own
file at `/app/config.json`:

```yaml
services:
  sable:
    image: ghcr.io/sableclient/sable:latest
    ports:
      - '8080:8080'
    volumes:
      - ./config.json:/app/config.json:ro
```

### Build it yourself

To build and serve Sable yourself with nginx, clone this repo and build it:

```sh
pnpm i # Installs all dependencies
pnpm run build # Compiles the app into the dist/ directory
```

After that, you can copy the dist/ directory to your server and serve it.

* In the [`config.json`](config.json), you can modify the default homeservers, feature rooms/spaces, toggle the account switcher, and toggle experimental simplified slilding sync support.

#### Optional default client settings

While the default settings are recommended for most users, you can optionally add a top-level `"settingsDefaults"` object whose keys match [client settings](src/app/state/settings.ts) (only fields you want to override) to override them. The default settings for any new logins will match these. Existing keys in local storage or users who chose to sync settings with their account data will still have their settings set.

For example:

```json
{
  "settingsDefaults": {
    "hour24Clock": true,
    "pageZoom": 110,
    "messageLayout": 2,
    "rightSwipeAction": "members",
    "captionPosition": "below",
    "renderUserCards": "both",
    "jumboEmojiSize": "large"
  }
}
```

Invalid or unknown keys are ignored.

* To deploy on subdirectory, you need to rebuild the app youself after updating the `base` path in [`build.config.ts`](build.config.ts).
    * For example, if you want to deploy on `https://sable.moe/app`, then set `base: '/app'`.

## Local development

> [!TIP]
> The easiest way to get started is with [mise](https://mise.jdx.dev/getting-started.html), it manages node, pnpm, rust, and other tooling.

```bash
mise install    # Install all required tools
mise run setup  # Install dependencies (pnpm install)
mise run dev    # Start the Vite dev server
```

Run `mise tasks` to list all available tasks (build, test, lint, etc.).

To build the app:
```sh
mise run build
```

### Desktop & Mobile (Tauri)

Sable uses [Tauri](https://v2.tauri.app) for native desktop and mobile builds.

```bash
mise run tauri:setup          # Install Rust toolchain + system packages
mise run tauri:setup:macos    # Install Xcode (macOS only)
mise run tauri:setup:windows  # Install VS Build Tools + WebView2 (Windows only)
mise run tauri wry dev        # Dev server with system webview (WebKit/WebView2)
mise run tauri cef build      # Production build with Chromium Embedded Framework
mise run tauri --help         # Any other args pass through to the Tauri CLI
```

When the first argument is `wry` or `cef` and the second is `dev` or `build`, the wrapper injects `--features <runtime>,updater --no-default-features`. Everything else is forwarded to `tauri` as-is.

## Deployment and infrastructure
Deployment workflows and infrastructure details live in
[`infra/README.md`](infra/README.md).
