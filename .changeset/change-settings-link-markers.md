---
default: patch
---

# Change how settings links are shared

Settings links copied from Sable now stay on the current client URL and include a small Sable marker in the link. That lets Sable recognize settings links copied from other Sable instances without treating unrelated third-party `/settings/...` links as Sable settings links.

When you send a bare settings link in the composer, Sable now rewrites it into a labeled link so it looks better on non-Sable clients too. For example: `[Settings > Account > Display Name](https://client.example/settings/account?focus=display-name&moe.sable.client.action=settings)`.

Invalid or malformed settings-looking links now stay normal links instead of being shown as settings chips.

If you previously set `settingsLinkBaseUrl` in `config.json`, remove it. Sable now derives settings links from the runtime app URL, and the old config key is no longer used.
