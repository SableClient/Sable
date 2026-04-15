---
default: patch
---

# Change how settings links are shared

Settings links copied from Sable now stay on the current client URL and include a small Sable marker in the link. That lets Sable recognize settings links copied from other Sable instances without treating unrelated third-party `/settings/...` links as Sable settings links.

If you previously set `settingsLinkBaseUrl` in `config.json`, remove it. Sable now derives settings links from the runtime app URL, and the old config key is no longer used.
