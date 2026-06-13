# Charm

Charm is a personal Matrix client distribution maintained by the CloudHub Social Team for the
CloudHub domain. It is based on [Sable](https://github.com/SableClient/Sable), an
AGPLv3 Matrix client forked from [Cinny](https://github.com/cinnyapp/cinny/).

The hosted web app lives at [charm.cloudhub.social](https://charm.cloudhub.social/).

## Attribution

Charm is maintained by CloudHub Social and is not an official Sable or Cinny release.
When describing this distribution, use:

> Maintained by the CloudHub Social Team. Based on Sable, an AGPLv3 Matrix
> client forked from Cinny.

## Self-hosting

You can self-host Charm by building the web app and serving the `dist/` directory
from any static web server.

```sh
pnpm i
pnpm run build
```

The runtime configuration is loaded from [`config.json`](config.json). You can
use it to change default homeservers, featured rooms and spaces, the account
switcher, push notification settings, and experimental feature toggles.

### Optional default client settings

While the default settings are recommended for most users, you can optionally
add a top-level `"settingsDefaults"` object whose keys match
[client settings](src/app/state/settings.ts). Only fields you include are
overridden. Existing local settings and Matrix account-data synced settings keep
their current values.

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

To deploy under a subdirectory, update the `base` path in
[`build.config.ts`](build.config.ts) and rebuild the app.

## Local development

> [!TIP]
> Use the Node version defined in [`.node-version`](.node-version). A version
> manager such as [fnm](https://github.com/Schniz/fnm) keeps this reproducible.

```sh
fnm use --corepack-enabled
corepack install
pnpm i
pnpm run dev
```

To build the app:

```sh
pnpm run build
```

## Deployment and infrastructure

Deployment workflows and Cloudflare infrastructure details live in
[`infra/README.md`](infra/README.md).

## Compatibility notes

Some internal names intentionally still use Sable namespaces:

- `sable_*` localStorage keys preserve existing diagnostics and settings choices.
- `moe.sable.*` Matrix account-data/event namespaces preserve synced settings
  compatibility.
- `.sable.css` theme filenames and `@sable-theme` metadata remain compatible
  with the Sable theme ecosystem.
- Dependencies published under `@sableclient/*` and SableClient GitHub URLs stay
  pinned until Charm-specific forks exist.
