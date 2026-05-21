# Sable Client Changelog

## 1.16.1 (2026-05-15)

### Fixes

* Fix issues related to editing messages with links losing previews or gaining \<> ([#847](<https://github.com/SableClient/Sable/pull/847>) by @7w1)
* Made markdown headers also function properly with single new lines instead of only two new lines. ([#837](<https://github.com/SableClient/Sable/pull/837>) by @7w1)
* Fix mentions not being linkfied. ([#837](<https://github.com/SableClient/Sable/pull/837>) by @7w1)
* Fixed crash when rendering some `m.room.pinned_events` timeline rows (old/malformed pin state edge case). ([#848](<https://github.com/SableClient/Sable/pull/848>) by @7w1)
* Fixed reply chips for deleted messages and media without captions showing `m.room.message` type instead of the event. ([#846](<https://github.com/SableClient/Sable/pull/846>) by @7w1)
* Fixed room pings looking like normal message links instead of pings. ([#837](<https://github.com/SableClient/Sable/pull/837>) by @7w1)
* Properly centered message loading indicators to avoid brief scrollbar shift while loading messages. ([#849](<https://github.com/SableClient/Sable/pull/849>) by @7w1)

## 1.16.0 (2026-05-14)

### Features

* Add Space banner support per MSC4221. You can now set it from the space settings. ([#801](<https://github.com/SableClient/Sable/pull/801>) by @nushea)
* Add setting to show icons of the rooms in the Rooms sidebar ([#768](<https://github.com/SableClient/Sable/pull/768>) by @nushea)
* Add Resize the sidepanels and the thread height of the original object using hoverable tools. ([#768](<https://github.com/SableClient/Sable/pull/768>) by @nushea)
* Add toggle to allow one to not join a call in a room by just clicking it in the sidebar. ([#768](<https://github.com/SableClient/Sable/pull/768>) by @nushea)
* Added the ability to right click on a folder to rename it. ([#814](<https://github.com/SableClient/Sable/pull/814>) by @7w1)
* Upgraded the forward modal to use the same modal present for search and added the ability to forward to same room the message is from. ([#808](<https://github.com/SableClient/Sable/pull/808>) by @7w1)

#### Introduce the new Sable logo! ([#809](<https://github.com/SableClient/Sable/pull/809>) by @Septicity)

- You may need to reinstall PWAs to recieve the new app icons, if you use them.
- Our logo is [licensed under CC0](https://github.com/SableClient/Sable/blob/dev/TRADEMARKS.md), aka do whatever you want with it!
- Also, there's a script for other us or other forks to replace the icon in the future, if needed.

### Fixes

* Add graceful fail if MSC4140 event delay exceeded ([#276](<https://github.com/SableClient/Sable/pull/276>) by @jasonlaguidice)
* Drops paragraph tags when messages are only a single paragraph, use markdown (two new lines) to define a new paragraph rather than a line break. ([#799](<https://github.com/SableClient/Sable/pull/799>) by @7w1)
* Fixed the text wrapping behavior of fallback messages. ([#806](<https://github.com/SableClient/Sable/pull/806>) by @7w1)
* Fixed the thin line appearing at the top of unstyled profiles. ([#803](<https://github.com/SableClient/Sable/pull/803>) by @7w1)
* Matrix.to links sent without explicit markdown formatting are sent as raw links instead of html links. ([#786](<https://github.com/SableClient/Sable/pull/786>) by @7w1)
* Fix `/myroomnick` and room cosmetics display name not updating name. ([#805](<https://github.com/SableClient/Sable/pull/805>) by @7w1)
* Fix spoilers not hiding nested content like mentions, emoji images, and custom-colored spans. ([#807](<https://github.com/SableClient/Sable/pull/807>) by @7w1)
* Added svgs to the allowed embeds for rendering/sending. ([#804](<https://github.com/SableClient/Sable/pull/804>) by @7w1)
* Suppress timeline dividers when there's no rendered events between them. ([#720](<https://github.com/SableClient/Sable/pull/720>) by @mvanhorn)
* Improve thread drawer separation between the pinned root message and replies with a border. ([#830](<https://github.com/SableClient/Sable/pull/830>) by @7w1)

## 1.15.3 (2026-05-09)

### Fixes

* Self-hosted deployments can set optional `settingsDefaults` in `config.json` to override built-in client settings. See the README for details. ([#785](<https://github.com/SableClient/Sable/pull/785>) by @7w1)
* Updated the math detection to avoid accidental detection when talking about math or spamming dollar signs. ([#779](<https://github.com/SableClient/Sable/pull/779>) by @7w1)
* Added a couple new settings for max incoming inline image height and default height for unspecified. http://localhost:8080/settings/appearance?focus=incoming-inline-images-default-height&moe.sable.client.action=settings ([#772](<https://github.com/SableClient/Sable/pull/772>) by @7w1)
* Fixed links with suppressed previews not having the arrow brackets readded when editing a message. ([#772](<https://github.com/SableClient/Sable/pull/772>) by @7w1)
* Added the ability to cap preview embed size. http://localhost:8080/settings/appearance?focus=link-preview-image-max-height&moe.sable.client.action=settings ([#783](<https://github.com/SableClient/Sable/pull/783>) by @7w1)
* Fix the inconsistent sizing for the read receipt dialog boxes. ([#772](<https://github.com/SableClient/Sable/pull/772>) by @7w1)
* Fixed room avatars set in the settings cosmetics menu not applying. ([#772](<https://github.com/SableClient/Sable/pull/772>) by @7w1)
* Fix room names being overriden when only 1 other person is in a room. ([#784](<https://github.com/SableClient/Sable/pull/784>) by @7w1)
* Fix small text being parsed in code blocks and not being escapeable. ([#782](<https://github.com/SableClient/Sable/pull/782>) by @7w1)
* Fixed the hang when a message that replies to a message has a reply, and you attempt to start a thread on that message. ([#778](<https://github.com/SableClient/Sable/pull/778>) by @7w1)
* Fix RTL/LTR mixed text formatting and alignment in messages ([#743](<https://github.com/SableClient/Sable/pull/743>) by @sinasadeghi83)
* Readded various missing settings from the settings sharing list. ([#765](<https://github.com/SableClient/Sable/pull/765>) by @7w1)
* Various small adjustments to the themed profiles for better consistency. ([#777](<https://github.com/SableClient/Sable/pull/777>) by @7w1)

## 1.15.2 (2026-05-07)

### Fixes

* Adds back the message editor toolbar under an optional setting. No longer uses WYSIWYG, just applies markdown. http://localhost:8080/settings/general?focus=composer-formatting-toolbar&moe.sable.client.action=settings ([#762](<https://github.com/SableClient/Sable/pull/762>) by @7w1)
* Fixed blockquotes needing a double backslash to escape and require a space after the `>` in order to form a blockquote. ([#758](<https://github.com/SableClient/Sable/pull/758>) by @7w1)
* Fix empty messages being displayed as broken messages. ([#754](<https://github.com/SableClient/Sable/pull/754>) by @7w1)
* Reescape arrow brackets when editing a message. ([#763](<https://github.com/SableClient/Sable/pull/763>) by @7w1)
* Fix extraneous markdown escape characters when editing code blocks. ([#762](<https://github.com/SableClient/Sable/pull/762>) by @7w1)
* Fixed jumpting to arbitrary events (e.g. reactions, edits, pins, leaves/joins). ([#759](<https://github.com/SableClient/Sable/pull/759>) by @7w1)
* Fix latex in codeblocks getting parsed. ([#758](<https://github.com/SableClient/Sable/pull/758>) by @7w1)
* Fixed message links being rendered as full links. ([#751](<https://github.com/SableClient/Sable/pull/751>) by @7w1)
* Fixed per-message profile proxies not unwrapping and generally just not working. (`f8a9a8f`)
* Fixed tweak automatic favoriting behavior when entering/leaving the catalog. ([#757](<https://github.com/SableClient/Sable/pull/757>) by @7w1)
* Fix tweaks not applying on built-in themes. ([#756](<https://github.com/SableClient/Sable/pull/756>) by @7w1)
* Added the ability to **underline** using `__underscores__`. ([#761](<https://github.com/SableClient/Sable/pull/761>) by @7w1)

## 1.15.1 (2026-05-05)

### Fixes

* Fix editing messages with custom emojis being converted into html tags. ([#749](https://github.com/SableClient/Sable/pull/749) by @7w1)
* Fix muted rooms appearing as standard unread rooms. ([#750](https://github.com/SableClient/Sable/pull/750) by @7w1)
* Fix the call stack size crash on load when sliding sync is enabled. ([#748](https://github.com/SableClient/Sable/pull/748) by @7w1)

## 1.15.0 (2026-05-05)

### Features

* Add background styling to user profile cards ([#712](https://github.com/SableClient/Sable/pull/712) by @nushea)
* Add preventing url preview cards by surrounding a link in anglebrackets like <https://app.sable.moe> ([#717](https://github.com/SableClient/Sable/pull/717) by @nushea)
* Reorganize Embed settings and reintroduce multiple embeds ([#667](https://github.com/SableClient/Sable/pull/667) by @nushea)
* Change Misc. data styling in users profile pages ([#663](https://github.com/SableClient/Sable/pull/663) by @nushea)
* add initial support for sending discoverable emojis and sticker ([#730](https://github.com/SableClient/Sable/pull/730) by @dozro)

#### Themes and tweaks from the catalog ([#633](https://github.com/SableClient/Sable/pull/633) by @7w1)

Themes are pulled from [a repo](https://github.com/SableClient/themes) now, so you get the full power of CSS instead of a palette. Tweaks are new: CSS overlays that sit on top of whatever theme you are using.

You'll be prompted to migrate to the new system whenever you update, if you choose not to, you'll be limited to the basic dark/light themes. A few additional themes have been added (Rose Pine variantes, Catpuccin) along with some basic tweaks (circular avatars, monochrome avatars, and square stuff).

You can share themes and tweaks. For themes uploaded online, simply hit the copy button in settings and paste the link in chat. If the setting is enabled, a preview will be generated. Third party themes (as defined by the config.json) have prominent warning banners and fetching is disabled by default.

You can also export and share theme files directly, although no previews are generated for these.

If you're intrested in getting a theme or tweak added to the official catalog, contribute to the themes repo linked above! We're eager to add more!

#### Markdown parser and render updates ([#727](https://github.com/SableClient/Sable/pull/727) by @7w1)

Migrated markdown parsing and rendering to use marked, which should fix most (all?) markdown issues involving lists/nested structures, inconsistent/inaccurate code blocks, escape sequences, and all the other bugs with literally everything.

Added math rendering support via marked and KaTeX, uses standard `$$` and `$` delimiters. Only renders a subset of latex tags that will likely need to be expanded so feel free to make issues if needed.

Also adds support for sending markdown tables (although they're rendered rather plainly at the moment), sending valid html directly (such as for colored text), and properly escaping anything with backslashes.

Fixes link previews appearing in code blocks, fixes pmp new line behavior, fixes links not opening in new tabs, and fixes editing arbitrary html messages, probably.

Finally, the old WYSIWYG editor has been completely removed.

### Fixes

* Fix spam-clicking abbreviations crashing sable ([#665](https://github.com/SableClient/Sable/pull/665) by @nushea)
* Add cache-control headers in Caddyfile for assets, service worker, and index.html ([#609](https://github.com/SableClient/Sable/pull/609) by @Just-Insane)
* Fix the first pin event in a room looking empty ([#685](https://github.com/SableClient/Sable/pull/685) by @nushea)
* Fix read receipt scrolling not working ([#631](https://github.com/SableClient/Sable/pull/631) by @Septicity)
* Fix status sometimes sticking in member tile ([#664](https://github.com/SableClient/Sable/pull/664) by @nushea)
* Fix apng files not animating. ([#737](https://github.com/SableClient/Sable/pull/737) by @7w1)
* Some fixes to sync requests being spammed on loading screen and for multi-account background syncing, it should also load faster now! ([#736](https://github.com/SableClient/Sable/pull/736) by @7w1)
* Fix other dmed party not being added as a founder by default when creating a dm. ([#737](https://github.com/SableClient/Sable/pull/737) by @7w1)
* Update verbiage in the credits ([#728](https://github.com/SableClient/Sable/pull/728) by @nushea)
* spoilered text now gets replaced with `[Spoiler]` in the plain text fallback, as per MSC4454 ([#715](https://github.com/SableClient/Sable/pull/715) by @dozro)
* Hide copied settings links on dynamic rows ([#695](https://github.com/SableClient/Sable/pull/695) by @hazre)
* Fix button hover background smearing in virtual list rows by suppressing transform on hover ([#614](https://github.com/SableClient/Sable/pull/614) by @Just-Insane)
* Fix Workbox precaching by removing injectionPoint override that was silently disabling all precache entries ([#611](https://github.com/SableClient/Sable/pull/611) by @Just-Insane)

#### Change how settings links are shared ([#695](https://github.com/SableClient/Sable/pull/695) by @hazre)

Settings links copied from Sable now stay on the current client URL and include a small Sable marker in the link. That lets Sable recognize settings links copied from other Sable instances without treating unrelated third-party `/settings/...` links as Sable settings links.

When you send a bare settings link in the composer, Sable now rewrites it into a labeled link so it looks better on non-Sable clients too. For example: `[Settings > Account > Display Name](https://client.example/settings/account?focus=display-name&moe.sable.client.action=settings)`.

Invalid or malformed settings-looking links now stay normal links instead of being shown as settings chips.

If you previously set `settingsLinkBaseUrl` in `config.json`, remove it. Sable now derives settings links from the runtime app URL, and the old config key is no longer used.

## 1.14.0 (2026-04-10)

### Features

* Add support for rendering bundled urls per MSC4095 ([#590](https://github.com/SableClient/Sable/pull/590) by @nushea)
* Improve code blocks with faster, more accurate syntax highlighting, broader language support, and separate light and dark theme options. ([#576](https://github.com/SableClient/Sable/pull/576) by @hazre)
* Add statuses to DMs ([#644](https://github.com/SableClient/Sable/pull/644) by @nushea)
* Add custom DM images and descriptions ([#644](https://github.com/SableClient/Sable/pull/644) by @nushea)
* Add statuses to Member Tile ([#644](https://github.com/SableClient/Sable/pull/644) by @nushea)
* Add the ability to set Global Name Colors dependent on the theme (dark/light) ([#656](https://github.com/SableClient/Sable/pull/656) by @nushea)
* Add a setting to collapse sidebar folders by default. ([#624](https://github.com/SableClient/Sable/pull/624) by @7w1)
* Add a "Dismiss" button to command response messages. ([#625](https://github.com/SableClient/Sable/pull/625) by @7w1)
* Update threads: various fixes, browse all room threads, and see live reply counts on messages. ([#564](https://github.com/SableClient/Sable/pull/564) by @Just-Insane)
* Re-introduced custom HTML formatting for long messages ([#641](https://github.com/SableClient/Sable/pull/641) by @Septicity)
* You can now share direct links to specific settings, and opening one takes you to the right section and highlights the target option. ([#577](https://github.com/SableClient/Sable/pull/577) by @hazre)
* Settings now use route-based navigation with improved desktop and mobile behavior, including better back and close handling. ([#577](https://github.com/SableClient/Sable/pull/577) by @hazre)

### Fixes

* Use file name instead of "a voice message" for non-voice audio files. ([#651](https://github.com/SableClient/Sable/pull/651) by @mvanhorn)
* Constrain bug report modal to viewport height to prevent overflow. ([#652](https://github.com/SableClient/Sable/pull/652) by @mvanhorn)
* Fix dms navigation not navigating to dms when local storage is messed up. ([#653](https://github.com/SableClient/Sable/pull/653) by @7w1)
* Fix reply button not capturing editor focus. ([#623](https://github.com/SableClient/Sable/pull/623) by @7w1)
* Fixes links not being clickable in formatted messages, including messages that use abbreviations. ([#632](https://github.com/SableClient/Sable/pull/632) by @hazre)
* Fix some zero-width (invisible) names ([#640](https://github.com/SableClient/Sable/pull/640) by @nushea)
* Fix iOS elastic bounce-back overscroll on the root element. ([#650](https://github.com/SableClient/Sable/pull/650) by @mvanhorn)
* Fixed the "sticky scrolling" issue in encrypted rooms with many PMP messages. ([#626](https://github.com/SableClient/Sable/pull/626) by @Septicity)
* Fix blank room timeline when app returns from background. When sliding sync delivers an `initial: true` response for the open room, a `TimelineReset` event now correctly shows skeleton placeholders while events reload instead of leaving an empty view. ([#657](https://github.com/SableClient/Sable/pull/657) by @Just-Insane)
* Image zooming is now centered on the cursor position ([#602](https://github.com/SableClient/Sable/pull/602) by @mini-bomba)
* Image zooming is now multiplicative instead of additive, resulting in a consistent "zooming speed". ([#602](https://github.com/SableClient/Sable/pull/602) by @mini-bomba)
* Image zoom buttons now zoom towards the center of the screen ([#602](https://github.com/SableClient/Sable/pull/602) by @mini-bomba)
* Right clicks no longer drag images in the viewer. ([#620](https://github.com/SableClient/Sable/pull/620) by @Septicity)
* Updated Support links to point to https://opencollective.com/sable ([#661](https://github.com/SableClient/Sable/pull/661) by @7w1)

## 1.13.1 (2026-03-30)

### Fixes

* Add youtube shorts support to stop it from crashing sable. ([#578](https://github.com/SableClient/Sable/pull/578) by @nushea)
* Fix rich-text reply previews and custom-formatted messages so unsafe HTML is filtered more strictly and Matrix colors render correctly. ([#571](https://github.com/SableClient/Sable/pull/571) by @hazre)
* Fix crash when previewing non-video YouTube URLs (channels, @handles, etc.) that lack query parameters. ([#584](https://github.com/SableClient/Sable/pull/584) by @Just-Insane)
* fix id handling and id generation for Personas ([#583](https://github.com/SableClient/Sable/pull/583) by @dozro)

## 1.13.0 (2026-03-28)

### Features

* Add ability to click on usernames in member and state events to view user info ([#536](https://github.com/SableClient/Sable/pull/536) by @thundertheidiot)
* Add black theme ([#437](https://github.com/SableClient/Sable/pull/437) by @Elec3137)
* added a limited compatibility with `pk;member` commands ([#550](https://github.com/SableClient/Sable/pull/550) by @dozro)
* Add /location sharing command, and a /sharemylocation command. ([#509](https://github.com/SableClient/Sable/pull/509) by @nushea)
* added option to use shorthands to send a message with a Persona, for example `✨:test` ([#550](https://github.com/SableClient/Sable/pull/550) by @dozro)
* Add quick reply keybinds by using <kbd>ctrl</kbd>+<kbd>up</kbd> / <kbd>ctrl</kbd>+<kbd>down</kbd> you can now cycle through the message you are replying to with keybinds ([#524](https://github.com/SableClient/Sable/pull/524) by @CodeF53)
* Adds a `/html` command to send HTML messages ([#560](https://github.com/SableClient/Sable/pull/560) by @Vespe-r)
* Add room abbreviations with hover tooltips: moderators define term/definition pairs in room settings; matching terms are highlighted in messages. ([#514](https://github.com/SableClient/Sable/pull/514) by @Just-Insane)
* Add support for timestamps, playlists and youtube music links for the youtube embeds ([#534](https://github.com/SableClient/Sable/pull/534) by @thundertheidiot)
* Add settings sync across devices via Matrix account data, with JSON export/import ([#515](https://github.com/SableClient/Sable/pull/515) by @Just-Insane)

### Fixes

* Add detailed error messages to forwarding failures. ([#532](https://github.com/SableClient/Sable/pull/532) by @7w1)
* Cap unread badge numbers at `1k+`, and something extra :) ([#484](https://github.com/SableClient/Sable/pull/484) by @hazre)
* Fix scroll-to-bottom after room navigation, timeline pagination reliability, and URL preview deduplication. ([#529](https://github.com/SableClient/Sable/pull/529) by @Just-Insane)
* Fixes the most recent pmp message in encrypted rooms not consistently rendering the pmp and not grouping with previous pmps. ([#526](https://github.com/SableClient/Sable/pull/526) by @7w1)
* fixed sending sticker and attachments while having a persona selected ([#525](https://github.com/SableClient/Sable/pull/525) by @dozro)
* Fix push notifications missing sender/room avatar and showing stale display names when using event_id_only push format. ([#551](https://github.com/SableClient/Sable/pull/551) by @Just-Insane)
* Sanitize formatted reply previews before rendering to prevent unsafe HTML from being parsed in reply snippets. ([#569](https://github.com/SableClient/Sable/pull/569) by @Just-Insane)
* Fix broken link to Sliding Sync known issues — now points to SableClient/Sable#39 instead of the old repository. ([#519](https://github.com/SableClient/Sable/pull/519) by @Just-Insane)
* Fix service worker authenticated media requests returning 401 errors after SW restart or when session data is missing/stale. ([#516](https://github.com/SableClient/Sable/pull/516) by @Just-Insane)
* rephrased the command describtion for `/usepmp` and made `/usepmp reset` actually reset the room association of the pmp ([#550](https://github.com/SableClient/Sable/pull/550) by @dozro)
* Fix confusing ui with `Client Side Embeds in Encrypted Rooms` setting ([#535](https://github.com/SableClient/Sable/pull/535) by @thundertheidiot)
* fix forwarding metadata by removing the `null` value ([#540](https://github.com/SableClient/Sable/pull/540) by @dozro)
* fix forwarding issue for users on synapse homeservers, by removing the relation ([#558](https://github.com/SableClient/Sable/pull/558) by @dozro)
* fixed the syntax issues regarding `/addpmp` and `usepmp` (note that the syntax for `/usepmp` has changed) ([#550](https://github.com/SableClient/Sable/pull/550) by @dozro)
* fix the display of jumbo emojis on messages sent with a persona ([#530](https://github.com/SableClient/Sable/pull/530) by @dozro)
* Fix sidebar notification badge positioning so unread and unverified counts align consistently. ([#484](https://github.com/SableClient/Sable/pull/484) by @hazre)
* Use the browser's native compact number formatting for room and member counts. ([#484](https://github.com/SableClient/Sable/pull/484) by @hazre)
* fix(sentry): scrub percent-encoded Matrix IDs and opaque base64url tokens from Sentry URLs ([#531](https://github.com/SableClient/Sable/pull/531) by @Just-Insane)

### Notes

* new/changed bios will now also be saved in the format MSC4440 expects ([#559](https://github.com/SableClient/Sable/pull/559) by @dozro)
* moved the setting for filtering pronouns by language from experimental to the appearance setting ([#521](https://github.com/SableClient/Sable/pull/521) by @dozro)

## 1.12.3 (2026-03-24)

### Fixes

* Fixed text autocomplete issues ([#487](https://github.com/SableClient/Sable/pull/487) by @nushea)
* Fix crash when url contains malformed/dangling uri components. ([#512](https://github.com/SableClient/Sable/pull/512) by @7w1)

## 1.12.2 (2026-03-24)

### Fixes

* Fix standard embed links not rendering. ([#506](https://github.com/SableClient/Sable/pull/506) by @7w1)
* Added maximum height to state events ([#491](https://github.com/SableClient/Sable/pull/491) by @nushea)

## 1.12.1 (2026-03-24)

### Fixes

* Change cloudflare deploy worker message to something much shorter to avoid char limit. ([#504](https://github.com/SableClient/Sable/pull/504) by @7w1)

## 1.12.0 (2026-03-24)

### Features

* `Ctrl + K` search menu is now context aware and lists the current space's rooms at the top. ([#499](https://github.com/SableClient/Sable/pull/499) by @7w1)
* Add knocking support when attempting to join a room from the directory, an address, a room mention, or space hierarchy, as well as text command support for knocking. Also improves rendering for knock notifications in rooms. ([#470](https://github.com/SableClient/Sable/pull/470) by @polyjitter)
* Add Android/iOS PWA-specific icon variants. ([#473](https://github.com/SableClient/Sable/pull/473) by @Septicity)
* Add support for youtube embeds. ([#497](https://github.com/SableClient/Sable/pull/497) by @thundertheidiot)
* Add sidebar three dot menu for quick access to related settings ([#474](https://github.com/SableClient/Sable/pull/474) by @wolterkam)
* Replies that mention the OP are now indicated by the OP username being prefixed with @ ([#465](https://github.com/SableClient/Sable/pull/465) by @mini-bomba)
* Made pin events show a tally of the messages that are pinned. ([#462](https://github.com/SableClient/Sable/pull/462) by @nushea)

#### Improve multiline composer and voice recording ([#476](https://github.com/SableClient/Sable/pull/476) by @hazre)

- Add a multiline composer layout for longer drafts.
- Keep the voice recorder between composer actions in multiline mode.
- Show the recorder inside the composer on mobile while recording.
- Prevent the composer from expanding when recording starts.
- Make the recorder footer and waveform fit better across screen sizes.
- Let interrupted mobile recording gestures still stop correctly.
- Stabilize wrap detection around edge cases like narrow widths and trailing spaces.

### Fixes

* Added error messages provided by homeserver to unknown login errors. ([#496](https://github.com/SableClient/Sable/pull/496) by @7w1)
* Ensure new updates always reload the page properly. ([#502](https://github.com/SableClient/Sable/pull/502) by @7w1)
* Removed the blocked users moved notice from notifications setting page. ([#490](https://github.com/SableClient/Sable/pull/490) by @7w1)
* Fix recieved encrypted message per-message profiles not triggering rerenders. ([#464](https://github.com/SableClient/Sable/pull/464) by @7w1)
* Add `.m4a` files as a recognized audio type. ([#472](https://github.com/SableClient/Sable/pull/472) by @henk717)
* Fix messages disappearing from rooms after reconnects and timeline resets. ([#478](https://github.com/SableClient/Sable/pull/478) by @hazre)
* Fix Camera being enabled by default even when the client has it off pre joining in browsers that permit the video (Electron/Tauri as examples). ([#485](https://github.com/SableClient/Sable/pull/485) by @Rawrington)
* Fix cinny-dark-theme link colors being too dark ([#469](https://github.com/SableClient/Sable/pull/469) by @Elec3137)
* Fix "Default" menu item height in room notification switcher. ([#466](https://github.com/SableClient/Sable/pull/466) by @polyjitter)
* fix the issue of empty displaynames of a persona, causing an empty fallback message, it will now ommit the fallback, if the name is empty or only consists of whitespace ([#495](https://github.com/SableClient/Sable/pull/495) by @dozro)
* Fixed an Android issue where recording a voice message with headphones could leave audio stuck in low-quality mode until the app was restarted. ([#476](https://github.com/SableClient/Sable/pull/476) by @hazre)
* Fixed voice message scrubbing/seeking on Firefox by switching the recorder from WebM (no seek index) to Ogg/Opus. ([#476](https://github.com/SableClient/Sable/pull/476) by @hazre)
* fixes touchpad zooming behaviour ([#481](https://github.com/SableClient/Sable/pull/481) by @integralfunction)
* Fixes width mismatch for the call chat view. ([#460](https://github.com/SableClient/Sable/pull/460) by @polyjitter)
* Fix messages sent from sable showing wrong on other client(s) ([#468](https://github.com/SableClient/Sable/pull/468) by @nushea)

### Documentation

* Updated PR template and CONTRIBUTING.md to add AI disclosure requirement. ([#456](https://github.com/SableClient/Sable/pull/456) by @Rosy-iso)

## 1.11.1 (2026-03-21)

### Fixes

* Fix conditional memo in reply renderer leading to crashes. ([#453](https://github.com/SableClient/Sable/pull/453) by @7w1)

## 1.11.0 (2026-03-21)

### Features

* Implemented improved rendering for space hierarchies in nav bar and lobby. ([#252](https://github.com/SableClient/Sable/pull/252) by @KaceCottam)
* Added styling for replies to non-messages. ([#416](https://github.com/SableClient/Sable/pull/416) by @nushea)

### Fixes

* Fix message composer clearing when edited messages are saved. ([#447](https://github.com/SableClient/Sable/pull/447) by @7w1)
* Fix editor flowing off screen when editing large messages in compact and bubble layouts. ([#447](https://github.com/SableClient/Sable/pull/447) by @7w1)
* Fix extra spacing in message editor. ([#447](https://github.com/SableClient/Sable/pull/447) by @7w1)
* Fix menu items not clickable due to menu transform. ([#450](https://github.com/SableClient/Sable/pull/450) by @7w1)
* Fix replies not rendering matrix.to links and opening them in new tabs instead of jumping to them. ([#448](https://github.com/SableClient/Sable/pull/448) by @7w1)
* Fix per-message profile messages collapsing together when different profiles are used. ([#449](https://github.com/SableClient/Sable/pull/449) by @7w1)
* Fix per-message profiles not updating avatar/name if edit events are recieved. ([#449](https://github.com/SableClient/Sable/pull/449) by @7w1)
* Fix editing per-message profile messages injecting profile name into message. ([#451](https://github.com/SableClient/Sable/pull/451) by @7w1)
* Fix per-message profiles not rendering in encrypted rooms. ([#449](https://github.com/SableClient/Sable/pull/449) by @7w1)
* Fix thread chips not appearing on thread root messages. ([#446](https://github.com/SableClient/Sable/pull/446) by @7w1)
* Fix up arrow to edit messages not editing messages. ([#447](https://github.com/SableClient/Sable/pull/447) by @7w1)

## 1.10.6 (2026-03-21)

### Fixes

* Change default notification server. ([#443](https://github.com/SableClient/Sable/pull/443) by @7w1)

## 1.10.5 (2026-03-20)

### Fixes

* Hide unread dot/highlight for rooms with notification mode set to Mute. ([#429](https://github.com/SableClient/Sable/pull/429) by @saschabuehrle)
* Fix thread drawer flooding console with "Ignoring event" warnings when server-side thread support is enabled. ([#438](https://github.com/SableClient/Sable/pull/438) by @Just-Insane)

## 1.10.4 (2026-03-20)

### Fixes

* Change default push notification server. ([#433](https://github.com/SableClient/Sable/pull/433) by @7w1)

## 1.10.3 (2026-03-20)

### Fixes

* Place persona settings behind a toggle in experimental. ([#431](https://github.com/SableClient/Sable/pull/431) by @7w1)

## 1.10.2 (2026-03-20)

### Fixes

* Fix edit button not always editing. ([#413](https://github.com/SableClient/Sable/pull/413) by @7w1)
* Fix search/nav/links/etc not loading messages. ([#413](https://github.com/SableClient/Sable/pull/413) by @7w1)
* Fix timeline not sticking to the bottom in non-reduced motion setting. ([#413](https://github.com/SableClient/Sable/pull/413) by @7w1)
* Replace matrix.org with matrixrooms.info in default featured servers section. ([#413](https://github.com/SableClient/Sable/pull/413) by @7w1)

## 1.10.1 (2026-03-20)

### Fixes

* Fix messages overlapping in timeline. ([#411](https://github.com/SableClient/Sable/pull/411) by @7w1)

## 1.10.0 (2026-03-20)

### Features

* added the posibility to send using per message profiles with `/usepmp` ([#309](https://github.com/SableClient/Sable/pull/309) by @dozro)
* Added a setting to Appearance that attempts to convert text in names like (it/its) into a pronoun pill, enlabed by default. ([#353](https://github.com/SableClient/Sable/pull/353) by @7w1)
* Rewrite the room timeline using Virtua to fix all the scroll bugs. ([#175](https://github.com/SableClient/Sable/pull/175) by @7w1)
* Update calls to have RNNoise noise suppression. ([#392](https://github.com/SableClient/Sable/pull/392) by @melogale)

### Fixes

* fix [accidental leaking of private nicknames](https://github.com/SableClient/Sable/issues/362) for users to be included in the message ([#365](https://github.com/SableClient/Sable/pull/365) by @dozro)
* Hide presence badge in members list for users without homeserver support, mimicking room profile apperance. ([#354](https://github.com/SableClient/Sable/pull/354) by @7w1)
* Tighten sliding sync memory management: stop the polling loop on client dispose, persist then prune large room timelines when leaving a room, remove adaptive timeline-limit logic, and auto-unsubscribe when the local user leaves or is banned from a room. ([#348](https://github.com/SableClient/Sable/pull/348) by @Just-Insane)
* Fix thread drawer showing no messages when using classic sync. ([#343](https://github.com/SableClient/Sable/pull/343) by @Just-Insane)
* Hide the redundant "Thread" indicator badge in the compose box when inside the Thread Drawer. ([#347](https://github.com/SableClient/Sable/pull/347) by @Just-Insane)
* Reduce dead space around the root message in the thread drawer. ([#344](https://github.com/SableClient/Sable/pull/344) by @Just-Insane)
* Added a toggle to notifications to disable full message mention highlighting. ([#355](https://github.com/SableClient/Sable/pull/355) by @7w1)
* Add a setting to disable reply mentions by default ([#405](https://github.com/SableClient/Sable/pull/405) by @mini-bomba)
* Reduced the opacity of mention highlight backgrounds to be less visually intrusive while remaining noticeable. ([#401](https://github.com/SableClient/Sable/pull/401) by @sachin-dul)

## 1.9.3 (2026-03-17)

### Fixes

* Fix autocomplete Enter & Tab key always selecting the first item and the first item not being highlighted on open. ([#310](https://github.com/SableClient/Sable/pull/310) by @Just-Insane)
* Fix messages with body empty but formatted body filled rendering as empty. ([#337](https://github.com/SableClient/Sable/pull/337) by @7w1)
* Fix emoticon autocomplete not respecting character threshold setting. ([#337](https://github.com/SableClient/Sable/pull/337) by @7w1)
* Fix images without explicit dimensions not appearing. ([#338](https://github.com/SableClient/Sable/pull/338) by @7w1)
* Fix Mac OS to macOS in the the devices tab ([#328](https://github.com/SableClient/Sable/pull/328) by @DidiDidi129)
* Improved voice message recording UI, it should now feel a lot more integrated. ([#311](https://github.com/SableClient/Sable/pull/311) by @hazre)
* Add opt-in Sentry crash reporting with a consent banner. ([#333](https://github.com/SableClient/Sable/pull/333) by @Just-Insane)

## 1.9.2 (2026-03-17)

### Fixes

* Fix opacity rendering in name colors. ([#325](https://github.com/SableClient/Sable/pull/325) by @7w1)
* Fix sending scheduled file attachments. ([#325](https://github.com/SableClient/Sable/pull/325) by @7w1)
* Fix replies rendering new lines when messages have lists. ([#325](https://github.com/SableClient/Sable/pull/325) by @7w1)
* Fix threads rendering fallback replies. ([#325](https://github.com/SableClient/Sable/pull/325) by @7w1)
* Remove pip video setting now that we have sable call ([#324](https://github.com/SableClient/Sable/pull/324) by @beef331)

## 1.9.1 (2026-03-17)

### Fixes

* Fix docker builds. ([#322](https://github.com/SableClient/Sable/pull/322) by @7w1)

## 1.9.0 (2026-03-17)

### Features

* Bring in Sable Call, our fork of element call, which introduces camera settings, screenshare settings, echo cancellation, noise suppression, automatic gain control, and avatars in calls. ([#127](https://github.com/SableClient/Sable/pull/127) by @melogale)
* added a `/sharehistory` command to [share encrypted history with a user](https://github.com/matrix-org/matrix-spec-proposals/blob/rav/proposal/encrypted_history_sharing/proposals/4268-encrypted-history-sharing.md) ([#296](https://github.com/SableClient/Sable/pull/296) by @dozro)
* added error page making it easier to report errors when they occur in the field ([#240](https://github.com/SableClient/Sable/pull/240) by @dozro)
* Push notifications now use `event_id_only` format — Sygnal never sees message content or sender metadata, and encrypted messages are decrypted client-side when the app tab is open ([#295](https://github.com/SableClient/Sable/pull/295) by @Just-Insane)
* Added a toggle to enable/disable showing the call button for large (> 10 member) rooms. ([#308](https://github.com/SableClient/Sable/pull/308) by @7w1)
* Add Sentry integration for error tracking and bug reporting ([#280](https://github.com/SableClient/Sable/pull/280) by @Just-Insane)
* Added the ability to edit the description of a file and streamlined the image and video ui ([#282](https://github.com/SableClient/Sable/pull/282) by @nushea)

### Fixes

* Add Ctrl+F / Cmd+F keyboard shortcut to open Sable search instead of browser find-in-page ([#304](https://github.com/SableClient/Sable/pull/304) by @Just-Insane)
* Add Vitest testing infrastructure with example tests and contributor documentation ([#297](https://github.com/SableClient/Sable/pull/297) by @Just-Insane)
* Account switcher: show a confirmation dialog before signing out of an account. ([#310](https://github.com/SableClient/Sable/pull/310) by @Just-Insane)
* Fix animated avatars not looping. ([#307](https://github.com/SableClient/Sable/pull/307) by @7w1)
* Autocomplete: pressing Enter now selects the highlighted item instead of sending the message. The first item is highlighted on open and ArrowUp/Down navigate the list while keeping typing focus in the editor. Focus returns to the message editor after completing a mention or emoji. ([#310](https://github.com/SableClient/Sable/pull/310) by @Just-Insane)
* Fix camera turning on by default when starting a call from the room header button ([#305](https://github.com/SableClient/Sable/pull/305) by @Just-Insane)
* Adding account: show a "Cancel" button next to the "Adding account" label so users can abort the flow. ([#310](https://github.com/SableClient/Sable/pull/310) by @Just-Insane)
* Fix duplicate unread badges on the /direct/ icon for DM rooms already shown as individual sidebar avatars ([#289](https://github.com/SableClient/Sable/pull/289) by @Just-Insane)
* Message editor: add `autoCapitalize="sentences"` to respect the OS/keyboard capitalisation setting on mobile. ([#310](https://github.com/SableClient/Sable/pull/310) by @Just-Insane)
* Fix emoji color bleeding into adjacent text in read receipt display names on Safari/WebKit ([#303](https://github.com/SableClient/Sable/pull/303) by @Just-Insane)
* Notifications: add "Favicon Dot: Mentions Only" setting — when enabled, the favicon badge only changes for mentions/keywords, not plain unreads. ([#310](https://github.com/SableClient/Sable/pull/310) by @Just-Insane)
* Support `matrixToBaseUrl` in `config.json` to override the default `matrix.to` link base URL. ([#314](https://github.com/SableClient/Sable/pull/314) by @Just-Insane)
* Video and audio messages: volume level is now persisted across page loads via `localStorage` and shared between all media players. ([#310](https://github.com/SableClient/Sable/pull/310) by @Just-Insane)
* Fix notification dot badge appearing off-center on sidebar avatars ([#306](https://github.com/SableClient/Sable/pull/306) by @Just-Insane)
* Reduced-motion: add `animation-iteration-count: 1` so spinners stop after one cycle instead of running indefinitely at near-zero speed. ([#310](https://github.com/SableClient/Sable/pull/310) by @Just-Insane)
* Server picker: prevent iOS from restoring the old server name while the user is actively editing the input. ([#310](https://github.com/SableClient/Sable/pull/310) by @Just-Insane)
* Browser tab/PWA: use the correct light (`#ffffff`) and dark (`#1b1a21`) theme-color values via `media` attribute on the meta tags. ([#310](https://github.com/SableClient/Sable/pull/310) by @Just-Insane)
* Fix excessive whitespace between the thread root message and replies in the thread drawer ([#302](https://github.com/SableClient/Sable/pull/302) by @Just-Insane)
* Fix thread messages to include the required `m.in_reply_to` fallback pointing to the latest thread event, so unthreaded clients can display the reply chain correctly per the Matrix spec. ([#288](https://github.com/SableClient/Sable/pull/288) by @Just-Insane)
* Fix spurious scroll-to-bottom and MaxListeners warnings on sync gap: stable callback refs and prevEventsLength guard in RoomTimeline, correct CallEmbed .bind(this) listener leak, stable refs in useCallSignaling, and unreadInfoRef to stop per-message listener churn ([#279](https://github.com/SableClient/Sable/pull/279) by @Just-Insane)
* Fix URL preview scroll arrows appearing when there is no content to scroll ([#301](https://github.com/SableClient/Sable/pull/301) by @Just-Insane)
* fix of compatibility of voice messages with element clients and style misshaps ([#286](https://github.com/SableClient/Sable/pull/286) by @dozro)

## 1.8.0 (2026-03-14)

### Features

* add voice message composing ([#176](https://github.com/SableClient/Sable/pull/176) by @dozro)
* added error page making it easier to report errors when they occur in the field ([#240](https://github.com/SableClient/Sable/pull/240) by @dozro)
* Show group DM participants with triangle avatar layout. Group DMs now display up to 3 member avatars in a triangle formation (most recent sender on top), with bot filtering and DM count badge support. ([#212](https://github.com/SableClient/Sable/pull/212) by @Just-Insane)
* Add internal debug logging system with viewer UI, realtime updates, and instrumentation across sync, timeline, and messaging ([#245](https://github.com/SableClient/Sable/pull/245) by @Just-Insane)
* Add thread support with side panel, browser, unread badges, and cross-device sync ([#123](https://github.com/SableClient/Sable/pull/123) by @Just-Insane)
* Optimize sliding sync with progressive loading and improved timeline management ([#232](https://github.com/SableClient/Sable/pull/232) by @Just-Insane)

### Fixes

* added settings toggle in (General>Messages) to enable showing a tombstone for deleted messages without having to set all hidden events to visible ([#238](https://github.com/SableClient/Sable/pull/238) by @dozro)
* added for compatibility sake the forward meta data as defined in MSC2723 ([#257](https://github.com/SableClient/Sable/pull/257) by @dozro)
* disabling quick add for encrypted sticker, this mitigates the issue of being unable to use quick to add encrypted sticker ([#236](https://github.com/SableClient/Sable/pull/236) by @dozro)
* Fix badge positioning and alignment across all sidebar components ([#231](https://github.com/SableClient/Sable/pull/231) by @Just-Insane)
* Fix bubble layout messages overflowing off the screen with embeds/images. ([#237](https://github.com/SableClient/Sable/pull/237) by @7w1)
* Fixed unhandled promise rejections in media blob cache and added automatic retry for chunk loading failures after deployments. ([#255](https://github.com/SableClient/Sable/pull/255) by @Just-Insane)
* Fix notification handling with null safety and improved logic ([#233](https://github.com/SableClient/Sable/pull/233) by @Just-Insane)
* Fix cosmetics tab crashing if global/room/space pronouns weren't already set. ([#229](https://github.com/SableClient/Sable/pull/229) by @7w1)
* Fix reaction clicks, zoom persistence, and empty message rendering ([#234](https://github.com/SableClient/Sable/pull/234) by @Just-Insane)
* Fix call preferences not persisting. ([#273](https://github.com/SableClient/Sable/pull/273) by @7w1)
* Add width limit to notification banners ([#253](https://github.com/SableClient/Sable/pull/253) by @Vespe-r)
* removed forwarding of beeper's per message profile, as this might confuse clients ([#256](https://github.com/SableClient/Sable/pull/256) by @dozro)
* tweak emoji board for speed optimization (opt-in because of computational load increase on homeserver for thubmnail generation) ([#262](https://github.com/SableClient/Sable/pull/262) by @dozro)
* Handles a middle-click on the url preview card thumbnail image by downloading the full image from the homeserver proxy through a fetch request and opening received blob in the new tab ([#264](https://github.com/SableClient/Sable/pull/264) by @piko-piko)

## 1.7.0 (2026-03-12)

### Features

* Added ability to start calls in DMs and rooms. DM calls will trigger a notification popup & ringtone (for other sable users/compatible clients, probably). ([#165](https://github.com/SableClient/Sable/pull/165) by @7w1)
* Merge in upstream call things and remove the duplicate new voice room button. ([#184](https://github.com/SableClient/Sable/pull/184) by @7w1)
* Add button to save a sticker you see in the message timeline to your personal account sticker pack. ([#107](https://github.com/SableClient/Sable/pull/107) by @dozro)
* Added config option `hideUsernamePasswordFields` for hosts to hide username and password fields from login page. ([#146](https://github.com/SableClient/Sable/pull/146) by @7w1)
* Add silent replies when clicking the bell icon during composing a reply. ([#153](https://github.com/SableClient/Sable/pull/153) by @dozro)
* Device names are now dynamic, showing your browser and OS (e.g., "Sable on Firefox for Windows") instead of just "Sable Web". ([#187](https://github.com/SableClient/Sable/pull/187) by @hazre)
* Implement an interface to allow room/space profile customization without needing to call the relating commands directly. ([#129](https://github.com/SableClient/Sable/pull/129) by @Rosy-iso)
* Added hover menu inside Message Version Pop-out. ([#170](https://github.com/SableClient/Sable/pull/170) by @nushea)

### Fixes

* Added a few accessibility tags to the elements involved in message composing. ([#163](https://github.com/SableClient/Sable/pull/163) by @dozro)
* Clarify notification settings and functionality once and for all. ([#148](https://github.com/SableClient/Sable/pull/148) by @7w1)
* Fix DM notifications, encrypted event notifications, and enable reaction notifications ([#178](https://github.com/SableClient/Sable/pull/178) by @Just-Insane)
* Fix images without an empty body display as "Broken Message" ([#143](https://github.com/SableClient/Sable/pull/143) by @7w1)
* Prevent overly wide emotes from taking up the entire screen width. ([#164](https://github.com/SableClient/Sable/pull/164) by @Sugaryyyy)
* Change to more standard compliant msgtype `m.emote` for `/headpat` event. ([#145](https://github.com/SableClient/Sable/pull/145) by @dozro)
* fix message forwarding metadata leak when forwarding from private rooms [see issue 190](https://github.com/SableClient/Sable/issues/190) ([#191](https://github.com/SableClient/Sable/pull/191) by @dozro)
* "Underline Links" setting no longer affects the entire app, only links in chat, bios, and room descriptions. ([#157](https://github.com/SableClient/Sable/pull/157) by @hazre)

## 1.6.0 (2026-03-10)

### Features

* GitHub repo moved to [SableClient/Sable](https://github.com/SableClient/Sable) go star it!
* Added a pop-up for showing a message's edit history
* In-app bug report and feature request modal.
* Mentions now receive a full-width background highlight in the room timeline.

* Adds a **Presence Status** toggle under Settings → General.

* Rewrites the sliding sync implementation to match the Element Web approach (MSC4186).

### Fixes

* Enhance UnsupportedContent and BrokenContent to display message body.
* Notification settings page improvements.
* In-app notification banner placement fixes.
* Notification delivery bug fixes.
* Prevent multiple forwards of a message if sending is slow.

## 1.5.3 (2026-03-08)

### Fixes

* Fix scroll clamping to bottom while scrolling up.
* Fix message links sometimes scrolling to bottom of timeline instead of message + maybe other scroll bugs.
* Merge upstream call fixes
* Fix crash when invalid location events are sent.
* Add rendering of per-message-profiles.
* custom emojis are now also visible in forwards, instead of being reduced to it's shortcode

* fix: default badge unread counts to off

## 1.5.2 (2026-03-08)

### Fixes

* Add `/hug`, `/cuddle`, `/wave`, `/headpat`, and `/poke` slash commands.
* Swap Caddy port to 8080 + fixes for MDAD setups.
* Adjust media sizing and URL preview layout
* Fix picture in picture setting not effecting element-call
* Fixed an issue where the app would fail to load after completing SSO login (e.g., logging in with matrix.org). Users are now correctly redirected to the app after SSO authentication completes.

## 1.5.1 (2026-03-08)

### Fixes

* Fix recent emojis ignoring letter threshold.
* Disable in-app banners on desktop.

## 1.5.0 (2026-03-08)

### Features

* Merge Voice Call updates from upstream.
* Allow for replying to state events.
* Add message forwarding with metadata
* Add setting to enable picture-in-picture in element-call
* Add support for audio and video in URL previews if homeserver provides it.
* Added a new setting "Emoji Selector Character Threshold" to set the number of characters to type before the suggestions pop up.
* Add keyboard navigation shortcuts for unread rooms (Alt+N, Alt+Shift+Up/Down), ARIA form label associations for screen reader accessibility, and a keyboard shortcuts settings page.
* Added setting to always underline links.
* Added settings for disabling autoplay of gifs (& banners), stickers, and emojis.
* Added reduced motion setting. Let us know if any elements were missed!
* Replaced the monochrome mode with a saturation slider for more control.
* Added settings to Account that let you set if you are a cat or have cats, or not display other peoples cat status.

### Fixes

* change indexdb warning phrasing to include low disk space as possible reason
* Fix Element Call video/audio calls in DM and non-voice rooms: after joining through the lobby, the in-call grid now displays correctly instead of showing only the control bar.
* Disable autocorrect and spellcheck on the login page.
* Fix Tuwunel quotes often breaking timezones
* Improved the UI of file descriptions
* Timeline message avatars now use the room-specific avatar and display name instead of the user's global profile, when set via `/myroomavatar` or `/myroomnick`.
* In-app notification banners now appear for DMs by default; desktop banner setting defaults to off; fixed space room navigation from banner tap.
* Executing /myroomnick or /myroomavatar without a new nickname/avatar now removes the nickname/avatar.
* Split typing and read status settings, allowing toggling off one and not the other.

## 1.4.0 (2026-03-06)

### Features

* Add option to filter user pronouns based on the pronouns language
* Added a "Badge Counts for DMs Only" setting: when enabled, unread count numbers only appear on Direct Message room badges; non-DM rooms and spaces show a plain dot instead of a number, even when Show Unread Counts is on.
* Added the ability to add descriptions to uploaded files
* Fixed in-app notification banners in encrypted rooms showing "Encrypted Message" instead of the actual content. Banners now also render rich text (mentions, inline images) using the same pipeline as the timeline renderer.
* You can now remove your own reactions even if you don't have the permission to add new ones, as long as you are able to delete your own events (messages).
* Add a method of quickly adding a new text reaction to the latest message, just like emote quick react, using the prefix `+#`
* Added two toggles in Settings > Appearance > Identity for disabling rendering room/space fonts and colors.
* Added an additional toggle, Show Unread Ping Counts, to override the Show Unread Counts allowing for only pings to have counts.

### Fixes

* Rename gcolor, gfont, and gpronoun commands to scolor, sfont, and spronoun respectively.
* Improved emoji board performance by deferring image pack cache reads so the board opens instantly rather than blocking on the initial render.
* Fix dm room nicknames applying to non-dm private rooms.
* Hide delete modal after successfully deleting a message.
* Fixed media authentication handling: removed unnecessary redirect following, added error fallback UI for failed media loads, and ensured authentication headers are applied consistently when rendering inline media in HTML message bodies.
* Failed message retry and delete actions now use Chip buttons for visual consistency with the rest of the interface.
* Adds a new message pill and background app highlighted unread count.
* Mobile: changed scheduled send chevron to tap + hold
* Reply quotes now automatically retry decryption for E2EE messages, display a distinct placeholder for replies from blocked users, and fix edge cases where reply event loading could silently fail.
* Service worker push notifications now correctly deep-link to the right account and room on cold PWA launch. Notifications are automatically suppressed when the app window is already visible. The In-App (pill banner) and System (OS) notification settings are now independent: desktop shows both controls, mobile shows Push and In-App only. Tapping an in-app notification pill on mobile now opens the room timeline directly instead of routing through the space navigation panel.
* Fixed several room timeline issues with sliding sync: corrected event rendering order, more accurate scroll-to-bottom detection, phantom unread count clearing when the timeline is already at the bottom, and fixed pagination spinner state.
* In-app notification banners now appear for DMs by default, even without a mention or keyword match.
* Notification banner on desktop now defaults to off, consistent with push notification defaults.
* Fixed space room navigation when tapping an in-app notification banner for a room inside a space.

## 1.3.3 - 3/4/2026

- Fix unread counts and dot badges for muted rooms ([#118](https://github.com/7w1/sable/pull/118)) - [Evie Gauthier](https://github.com/Just-Insane)
- /raw, /rawmsg, /rawacc, /delacc, /setext, /delext for modifying arbitrary data in various places. Do not use them if you don't know what they mean. It can break things. Locked behind developer tools settings. ([#120](https://github.com/7w1/sable/pull/120))
- Quick reactions by typing +:emoji and hitting tab ([#132](https://github.com/7w1/sable/pull/132)) - [mini-bomba](https://github.com/mini-bomba)
- Add support for [MSC4140](https://github.com/matrix-org/matrix-spec-proposals/pull/4140) scheduled messages on homeservers that support it ([#113](https://github.com/7w1/sable/pull/113))
- Add /discardsession command to force discard e2ee session in current room ([#119](https://github.com/7w1/sable/issues/119), [#123](https://github.com/7w1/sable/pull/123))
- Fix consistency of nicknames in dm rooms ([#122](https://github.com/7w1/sable/pull/122)) - [Rose](https://github.com/dozro)
- Message sending improvements, color change instead of "Sending..." message. ([#128](https://github.com/7w1/sable/pull/128)) - [Evie Gauthier](https://github.com/Just-Insane)
- Fix view source scroll bar. ([#125](https://github.com/7w1/sable/pull/125))
- Added back Cinny Light theme as an option ([#80](https://github.com/7w1/sable/issues/80), [#126](https://github.com/7w1/sable/pull/126))
- Fix auto capitalization in login screen ([#131](https://github.com/7w1/sable/pull/131)) - [Rose](https://github.com/dozro)
- Automated deployments with Cloudflare Workers IaC ([#116](https://github.com/7w1/sable/pull/116)) - [haz](https://github.com/hazre)
- Notification delivery, account switching, and unread count toggle fixes ([#127](https://github.com/7w1/sable/pull/127)) - [Evie Gauthier](https://github.com/Just-Insane)
- More sliding sync fixes: cache emoji packs and fix edit message rendering ([#134](https://github.com/7w1/sable/pull/134)) - [Evie Gauthier](https://github.com/Just-Insane)

## 1.3.2 - 3/3/2026

- Content toggles in push notifications ([#88](https://github.com/7w1/sable/pull/88)) - [Evie Gauthier](https://github.com/Just-Insane)
- /rainbow command, supports markdown ([#105](https://github.com/7w1/sable/pull/105))
- Settings interface consistency updates ([#89](https://github.com/7w1/sable/pull/89), [#97](https://github.com/7w1/sable/pull/97)) - [Rosy-iso](https://github.com/Rosy-iso)
- Display statuses ([#98](https://github.com/7w1/sable/pull/98)) - [Shea](https://github.com/nushea)
- Set statuses and improve member list status apperance ([#110](https://github.com/7w1/sable/pull/110))
- More sliding sync bug fixes and improvements ([#87](https://github.com/7w1/sable/pull/87)) - [Evie Gauthier](https://github.com/Just-Insane)
- Replace `-#` small html tag with sub html tag to comply with spec. ([#90](https://github.com/7w1/sable/pull/90))
- Update reset all notifications button styles to conform better. ([#100](https://github.com/7w1/sable/pull/100))
- Fix user registration flow ([#101](https://github.com/7w1/sable/pull/101)) - [Evie Gauthier](https://github.com/Just-Insane)
- Add homeserver info to About page ([#84](https://github.com/7w1/sable/pull/84)) - [Rosy-iso](https://github.com/Rosy-iso)
- Add Accord theme, similar to another -cord ([#102](https://github.com/7w1/sable/pull/102)) - [kr0nst](https://github.com/kr0nst)
- Add Cinny Silver theme ([#80](https://github.com/7w1/sable/issues/80), [#108](https://github.com/7w1/sable/pull/108))
- Potentially fix bio scroll appearing when it shouldn't ([#104](https://github.com/7w1/sable/pull/104))
- Add /raw command to send raw message events ([#96](https://github.com/7w1/sable/issues/96), [#106](https://github.com/7w1/sable/pull/106))
- Adds a reset button and changes the system sync button to text for clarity ([#103](https://github.com/7w1/sable/issues/103), [#107](https://github.com/7w1/sable/pull/107))
- Fix logout flow to improve UX ([#111](https://github.com/7w1/sable/pull/111))

## 1.3.1 - 3/3/2026

- Important sliding sync config patches, notifications fixes, and client side toggle ([#85](https://github.com/7w1/sable/pull/85))

## 1.3.0 - 3/2/2026

- Mobile push notifications! ([#44](https://github.com/7w1/sable/issues/44), [#49](https://github.com/7w1/sable/pull/49)) - [Evie Gauthier](https://github.com/Just-Insane)
- Beta Simplified Sliding Sync support ([#67](https://github.com/7w1/sable/pull/67), [#75](https://github.com/7w1/sable/pull/75)) - [Evie Gauthier](https://github.com/Just-Insane)
- Codebase cleanups, CI improvements, and docker builds ([#26](https://github.com/7w1/sable/pull/26), [#35](https://github.com/7w1/sable/pull/35), [#62](https://github.com/7w1/sable/pull/62), [#64](https://github.com/7w1/sable/pull/64), [#65](https://github.com/7w1/sable/pull/65)) - [haz](https://github.com/hazre)
- Add room/space specific pronouns, when enabled by room/space admin. ([#30](https://github.com/7w1/sable/issues/30))
- Add validation to timezones before rendering.
- Fix invalid matrix.to event link generation ([cinnyapp#2717](https://github.com/cinnyapp/cinny/pull/2717)) - [tulir](https://github.com/tulir)
- Fix Call Rooms' chat button ([#58](https://github.com/7w1/sable/pull/58)) - [Rosy-iso](https://github.com/Rosy-iso)
- Strip quotes for mxc urls converted to http for tuwunel ([#56](https://github.com/7w1/sable/pull/56)) - [Rosy-iso](https://github.com/Rosy-iso)
- Add Sable space and announcements room to featured communities.
- Unobfusticate css in production builds.

## 1.2.3 - 3/2/2026

- Actually fix quotes around colors for tuwunel homeservers ([#46](https://github.com/7w1/sable/issues/46))
- Option to have your own message bubbles in bubble layout right aligned ([#38](https://github.com/7w1/sable/issues/38))
- Allow responding to and rendering replies with files ([#54](https://github.com/7w1/sable/pull/54)) - [nushea](https://github.com/nushea)
- Added Gruvbox theme ([#51](https://github.com/7w1/sable/pull/51)) - [dollth.ing](https://github.com/dollth-ing)

## 1.2.2 v2

- hotfix for stupid firefox cors crash

## 1.2.2 - 3/1/2026

- Fixed/updated unknown extended profile keys rendering.
- Added support for `---`, `-#`, and fixed `-` to be unordered.
- Fix quotes around colors for tuwunel homeservers ([#46](https://github.com/7w1/sable/issues/46))
- Added Rosé Pine theme ([#41](https://github.com/7w1/sable/pull/41)) - [wrigglebug](https://github.com/wrigglebug)
- Add back default Cinny Dark theme.
- Merge time formatting improvements from ([cinnyapp#2710](https://github.com/cinnyapp/cinny/pull/2710)) - [nushea](https://github.com/nushea)
- Merge Uniform avatar appearance in space/room navigation from ([cinnyapp#2713](https://github.com/cinnyapp/cinny/pull/2713)) - [wolterkam](https://github.com/wolterkam)
- Merge Streamline the confusing DM invite user experience from ([cinnyapp#2709](https://github.com/cinnyapp/cinny/pull/2709)) - [wolterkam](https://github.com/wolterkam)

## 1.2.1

- Update pronouns to match [MSC4247](https://github.com/matrix-org/matrix-spec-proposals/pull/4247) format better and support up to 3 pronoun pills on desktop, 1 on mobile ([#23](https://github.com/7w1/sable/issues/23), [#33](https://github.com/7w1/sable/pull/33)) - [ranidspace](https://github.com/ranidspace)
  - Unfortunately, **everyone who set pronouns in Sable will need to reset them.**
- Fix jumbo-ified non-emojis with colons. ([#32](https://github.com/7w1/sable/issues/32))
- Show full timestamps on hover. ([cinnyapp#2699](https://github.com/cinnyapp/cinny/issues/2699))
- Enable Twitter-style emojis by default.
- Make inline editor buttons buttons.
- Name colors in pinned messages.
- Rename "Heating up" to "Petting cats"
- Concurrency guard for profile lookups.
- Hex color input for power level editor.
- Editing previous messages with keybinds no longer breaks message bar ([#36](https://github.com/7w1/sable/issues/36))

## 1.2.0

- Codebase cleanup ([#22](https://github.com/7w1/sable/pull/22)) - [haz](https://github.com/hazre)
- Fix mono font ([#18](https://github.com/7w1/sable/pull/18)) - [Alexia](https://github.com/cyrneko)
- Merge final commits from ([cinnyapp#2599](https://github.com/cinnyapp/cinny/pull/2599))
- Unread pin counter & highlighting ([#25](https://github.com/7w1/sable/pull/25), [#31](https://github.com/7w1/sable/pull/31))

## 1.1.7

- Fix delete and report button colors.
- Fix modal backgrounds missing in some menus.
- Reply is now a toggle. When you click/swipe to reply to the message you're already replying to, it's reset.
- Option to hide member events in read-only rooms, like announcement channels, so you can actually read them. Enabled by default.
- Improvements to image and pdf viewers. Touch pan/zoom, scroll wheel zoom, and better reponsiveness.
- Fixed gestures occasionally triggering inside image and pdf viewer.

## 1.1.6

- Fix crash if too many emojis present [cinnyapp#2570](https://github.com/cinnyapp/cinny/issues/2570)

## Version 1.1.5

- Various performance improvements. See commits for details.
- Fix typing indicator z index on mobile.
- Fix room nicknames not displaying.
- Fix rare crash with colorMXID [(#15)](https://github.com/7w1/sable/pull/15)
- Fix crash from long pronoun pills [(#16)](https://github.com/7w1/sable/pull/16)

## Version 1.1.4

- Various performance improvements
- Fix bio editor crashing when faced with commet bio format.

## Version 1.1.3

_skipped a number since lots of updates :3_

- Profile banners. Support's Commet's format.
- Global name colors. Can be disabled in settings.
- Even more refractoring to improve timeline & user profile speeds and caches and fix that stupid bug.
  - probably introduced more bugs tbh, but things should be faster and less intense on resources?
- Pinned messages actually jump to the damn pins instead of somewhere vaguely nearby half the time.
  - that is... if they've been seen before. otherwise it just gives up sadly.
- Mobile context menu is opened by double tapping on a message instead of holding.
- ~~Fixed bio editor formatting.~~ This was a lie.
- Properly clear user data when account settings are updated.

## Version 1.1.1

- More cache fixes and improvements.
- Fix flash of extra info when click on profiles sometimes.
- Added minimum width for widgit drawer.

## Version 1.1.0

- Global profile cache & automatic cache clearing on member update events along with other improvements.
- Fix unexpected bio field formats.
- Widgets support.
- (potentially) fixed rare crash when ~~changing rooms~~ existing. please...

## Version 1.0.1

- (potentially) fixed rare crash when changing rooms
- Support Commet bios.
- Raise bio limit to 1024 characters.
- Account switcher toggle in config.json.

## Version 1.0.0

- Releases provided in releases tab. Versions for Windows & Linux built via electron.
- Account switcher made by TastelessVoid. PR #1
- Gestures for mobile.
- Notifications jump to location instead of inbox.
- Merged voice & video calls from Cinny PR #2599.
- Client-side previews for some image and video formats.
  - Will attempt to preview all image/video links in a message, if there are none, it generates a standard preview, forwarding the request to the homeserver.
  - Bug fix for images/links/anything that loads after room is opened, properly shifting the scroll to the bottom.
- Client-side nicknames for other users. PR #3
- Inline editor for editing messages.
- Pronouns, bios, and timezones.
- Pressing send on mobile no longer closes keyboard.
  - Pressing enter on mobile will always provide a newline, ignores the setting for desktop.
- More reactive UI (literally just buttons shifting up and shrinking on click)
- Added name colors and fonts to the member list sidebar.
- Added a reset button to the room name input box for dms.
  - Reset's the dm room name to the name of the other user (on both ends).
  - Same as saving a blank room name.
- New UI colors & fonts.
- Pronoun pills.
- Updated legacy colors (aka random name colors) to no longer be legacy and now be pretty.
- Fixed background & header for PWA on iOS devices.
- Lighten on currently hovered message.
- Privacy blur options in Appearance tab in user settings.
- Jumbo emoji size selector in Appearance tab in user settings.
- Added Cosmetics tab to room and space settings.
- New cosmetic commands, requires power level 50. Permission located in Cosmetics tab.
  - /color #ffffff -> change your name color for a room
  - /gcolor #111111 -> change your name color for a space
  - /font monospace -> change your name font for a room
  - /font Courier New -> change your name font for a space
- Hierarchies
  - Room Color > Space Color > Role Color > Default
  - Room Font > Space Font > Default
    - _Note, if the room font is invaild it will fallback directly to default, not the space font._
- Includes all features in Cinny v4.10.5
