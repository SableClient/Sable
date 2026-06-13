# Charm Branding

Charm is the independently maintained personal Matrix client hosted under the CloudHub domain by the CloudHub Social Team.
It is based on Sable, which is itself based on Cinny.

## Required attribution

Use this wording in visible user-facing surfaces where practical:

> Maintained by the CloudHub Social Team. Based on Sable, an AGPLv3 Matrix client forked from Cinny.

Do not imply that the Sable maintainers officially ship, review, or support this distribution.

## Current app identity

- App name: Charm
- Primary URL: https://charm.cloudhub.social
- Bundle identifier: social.cloudhub.charm
- Deep link scheme: charm
- Web push app ID: social.cloudhub.charm.web
- UnifiedPush app ID: social.cloudhub.charm.up

## Name options considered

- Charm: personal, witchy, friendly, and concise.
- CloudHub: direct, already matches the CloudHub domain and push namespace.
- CloudHub Chat: clearer in app-store search, but less flexible if the product grows beyond chat.
- CloudHub Social: stronger community positioning, but longer and slightly more formal.
- Relay: good Matrix metaphor, but likely crowded and harder to defend.
- Constellate: distinctive and social, but less immediately tied to the existing CloudHub identity.

## Icon direction

The current icon is a generated Charm mark: a speech bubble framed like a small talisman or sigil. It is intentionally separate from the Sable bird silhouette so users see this as an independent distribution.

## Compatibility names that stay as-is

Some internal namespaces are intentionally not renamed yet:

- `sable_*` localStorage keys, because they preserve existing user diagnostics and settings choices.
- `moe.sable.*` Matrix account-data/event types, because renaming them would fork synced settings and room metadata.
- `.sable.css`, `@sable-theme`, and `@sable-tweak`, because these are theme ecosystem compatibility names.
- `@sableclient/*` dependencies and SableClient GitHub URLs, because those still point to upstream packages this fork consumes.
