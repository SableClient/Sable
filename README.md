# Sable

A Matrix client built to enhance the user experience with quality-of-life features, cosmetics, utilities, and sheer usability. See the [changelog](https://github.com/SableClient/Sable/blob/dev/CHANGELOG.md).

Soon to be replaced desktop apps can be downloaded [here](https://github.com/7w1/sable/releases/tag/1.0.0). They auto-update by pulling the website.

Join our matrix space [here](https://matrix.to/#/#sable:sable.moe) to discuss features, issues, or meowing.

Forked from [Cinny](https://github.com/cinnyapp/cinny/).

## Getting started
The stable web app is available at [app.sable.moe](https://app.sable.moe/) and tracks the [latest GitHub release](https://github.com/SableClient/Sable/releases/latest). Nightly builds are available at [dev.sable.moe](https://dev.sable.moe/) and from the [`nightly` GitHub release](https://github.com/SableClient/Sable/releases/tag/nightly).

You can also download our desktop app for Windows and Linux from [releases](https://github.com/SableClient/Sable/releases/latest). Release artifacts include build attestations. AppImage and Windows installations update automatically; `.deb`, `.rpm`, and AUR installations update through their package manager.

### Desktop (Linux / macOS / Windows)

<a href="https://github.com/SableClient/Sable/releases/latest"><img alt="Download" src="https://img.shields.io/badge/Download-181717?style=for-the-badge&logo=github"></a>
&nbsp;
<a href="https://flathub.org/apps/moe.sable.client"><img alt="Flathub" src="https://img.shields.io/badge/Install_via_Flathub-4A86CF?style=for-the-badge&logo=flathub"></a>

On macOS, via our [Homebrew tap](https://github.com/SableClient/homebrew-sable):

```sh
brew install --cask SableClient/sable/sable
```

The fully qualified name matters: since [Homebrew 6.0.0](https://brew.sh/2026/06/11/homebrew-6.0.0/) non-official taps need explicit trust, and installing this way trusts just this one cask. `brew tap` followed by a short-name install now fails unless you also run `brew trust`.

On Linux, nightly builds have their own Flatpak remote, rebuilt from `dev` every night:

```sh
flatpak remote-add --if-not-exists sable-nightly https://sableclient.github.io/Sable/sable-nightly.flatpakrepo
flatpak install sable-nightly moe.sable.client.Nightly
```

It installs alongside the stable Flathub build under a separate application ID. Built by the `build-nightly-flatpak` and `publish-nightly-flatpak` jobs in [`tauri-build.yml`](.github/workflows/tauri-build.yml).

## Android (Obtainium)

Android APKs are published to every release, and [Obtainium](https://obtainium.imranr.dev) keeps them updated straight from GitHub. Each release also ships an `obtainium.json` app config. Use it for the nightly channel, where prereleases and date-based version tracking have to be enabled to follow the rolling `nightly` tag.

### Stable

<a href="https://apps.obtainium.imranr.dev/redirect?r=obtainium://add/https://github.com/SableClient/Sable"><img alt="Add to Obtainium" src="https://img.shields.io/badge/Add_to_Obtainium-6750A3?style=for-the-badge"></a>
&nbsp;
<a href="https://github.com/SableClient/Sable/releases/latest/download/obtainium.json"><img alt="App config" src="https://img.shields.io/badge/App_config-6B7280?style=for-the-badge"></a>
&nbsp;
<a href="https://github.com/SableClient/Sable/releases/latest"><img alt="Download APK" src="https://img.shields.io/badge/Download_APK-3DDC84?style=for-the-badge&logo=android"></a>

### Nightly

<a href="https://apps.obtainium.imranr.dev/redirect?r=obtainium://app/%7B%22id%22%3A%22moe.sable.client.nightly%22%2C%22url%22%3A%22https%3A%2F%2Fgithub.com%2FSableClient%2FSable%22%2C%22author%22%3A%22SableClient%22%2C%22name%22%3A%22Sable%20Nightly%22%2C%22preferredApkIndex%22%3A0%2C%22additionalSettings%22%3A%22%7B%5C%22about%5C%22%3A%5C%22An%20almost%20stable%20Matrix%20client%5C%22%2C%5C%22includePrereleases%5C%22%3Atrue%2C%5C%22useLatestAssetDateAsReleaseDate%5C%22%3Atrue%2C%5C%22releaseDateAsVersion%5C%22%3Atrue%2C%5C%22versionDetection%5C%22%3Afalse%7D%22%2C%22overrideSource%22%3A%22GitHub%22%7D"><img alt="Add to Obtainium" src="https://img.shields.io/badge/Add_to_Obtainium-6750A3?style=for-the-badge"></a>
&nbsp;
<a href="https://github.com/SableClient/Sable/releases/download/nightly/obtainium.json"><img alt="App config" src="https://img.shields.io/badge/App_config-6B7280?style=for-the-badge"></a>
&nbsp;
<a href="https://github.com/SableClient/Sable/releases/tag/nightly"><img alt="Download APK" src="https://img.shields.io/badge/Download_APK-3DDC84?style=for-the-badge&logo=android"></a>

### Setup & install

1. Install [Obtainium](https://github.com/ImranR98/Obtainium/releases/latest).
2. Tap **Add to Obtainium** above. Stable opens the **Add App** page prefilled with `https://github.com/SableClient/Sable`; nightly opens an import prompt, since it carries the prerelease and version-tracking settings the rolling `nightly` tag needs.
3. Or download the `obtainium.json` for either channel and import it with **Import/Export → Import from file**.

Android builds are produced by the `android` job in [`tauri-build.yml`](.github/workflows/tauri-build.yml), and the config by the `obtainium` job in the same workflow.

### Relevant variables and switching between Nightly and Stable

Relevant variable differences between Nightly and Stable:
- *Include prereleases* - `true` for Nightly, `false` for Stable
- *Fallback to older releases* - `false` for Nightly, `true` for Stable
- *Use latest asset upload as release date* - `true` for Nightly, `false` for Stable (this is due to Nightly builds being uploaded to one release instead of creating new ones)
- *Use release date as version string (pseudo-version)* - `true` for Nightly, `false` for Stable (this is due to Nightly builds being uploaded to one release instead of creating new ones)

## iOS (AltStore / SideStore)

Sable iOS builds are distributed as unsigned IPAs through [AltStore](https://altstore.io) and [SideStore](https://sidestore.io). Each release publishes both the IPA and an `altstore-source.json` manifest — stable builds to the [latest GitHub release](https://github.com/SableClient/Sable/releases/latest), nightly builds to the [`nightly` GitHub release](https://github.com/SableClient/Sable/releases/tag/nightly).

### Stable Source

<a href="https://intradeus.github.io/http-protocol-redirector?r=altstore://source?url=https://github.com/SableClient/Sable/releases/latest/download/altstore-source.json"><img alt="Add to AltStore" src="https://img.shields.io/badge/Add_to_AltStore-7C3AED?style=for-the-badge"></a>
&nbsp;
<a href="https://intradeus.github.io/http-protocol-redirector?r=sidestore://source?url=https://github.com/SableClient/Sable/releases/latest/download/altstore-source.json"><img alt="Add to SideStore" src="https://img.shields.io/badge/Add_to_SideStore-2563EB?style=for-the-badge"></a>
&nbsp;
<a href="https://github.com/SableClient/Sable/releases/latest/download/altstore-source.json"><img alt="Direct URL" src="https://img.shields.io/badge/Direct_URL-6B7280?style=for-the-badge"></a>

### Nightly Source

<a href="https://intradeus.github.io/http-protocol-redirector?r=altstore://source?url=https://github.com/SableClient/Sable/releases/download/nightly/altstore-source.json"><img alt="Add to AltStore" src="https://img.shields.io/badge/Add_to_AltStore-7C3AED?style=for-the-badge"></a>
&nbsp;
<a href="https://intradeus.github.io/http-protocol-redirector?r=sidestore://source?url=https://github.com/SableClient/Sable/releases/download/nightly/altstore-source.json"><img alt="Add to SideStore" src="https://img.shields.io/badge/Add_to_SideStore-2563EB?style=for-the-badge"></a>
&nbsp;
<a href="https://github.com/SableClient/Sable/releases/download/nightly/altstore-source.json"><img alt="Direct URL" src="https://img.shields.io/badge/Direct_URL-6B7280?style=for-the-badge"></a>

### Setup & install

1. Set up [AltStore Classic](https://faq.altstore.io/altstore-classic/altserver) or [SideStore](https://docs.sidestore.io) on your device.
2. Add the Sable source (tap a button above), or add it manually:
   - AltStore (stable): `altstore://source?url=https://github.com/SableClient/Sable/releases/latest/download/altstore-source.json`
   - SideStore (stable): `sidestore://source?url=https://github.com/SableClient/Sable/releases/latest/download/altstore-source.json`
   - AltStore (nightly): `altstore://source?url=https://github.com/SableClient/Sable/releases/download/nightly/altstore-source.json`
   - SideStore (nightly): `sidestore://source?url=https://github.com/SableClient/Sable/releases/download/nightly/altstore-source.json`
3. Install Sable from the source. The IPA is unsigned; AltStore/SideStore re-sign it with your personal development certificate at install time, so apps refresh every 7 days (the standard free-account limitation).

iOS builds are produced by the `ios` job in [`tauri-build.yml`](.github/workflows/tauri-build.yml) and track the same `dev`/`v*` triggers as desktop builds.

## Self-hosting
You have a few options for self hosting, you can:
1. Run the prebuilt docker container.
2. Deploy on a site like GitLab Pages. Jae has a [guide here](https://docs.j4.lc/Tutorials/Deploying-Sable-on-GitLab-Pages).
3. Build it yourself.

### Docker

Prebuilt images are published to `ghcr.io/sableclient/sable`.

- `latest` tracks the current latest version release.
- `dev` tracks the current `dev` branch image.
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
