---
default: minor
---

# Markdown parser and render updates

Migrated markdown parsing and rendering to use marked, which should fix most (all?) markdown issues involving lists/nested structures, inconsistent/inaccurate code blocks, escape sequences, and all the other bugs with literally everything.

Added math rendering support via marked and KaTeX, uses standard `$$` and `$` delimiters. Only renders a subset of latex tags that will likely need to be expanded so feel free to make issues if needed.

Also adds support for sending markdown tables (although they're rendered rather plainly at the moment), sending valid html directly (such as for colored text), and properly escaping anything with backslashes.

Fixes link previews appearing in code blocks, fixes pmp new line behavior, fixes links not opening in new tabs, and fixes editing arbitrary html messages, probably.

Finally, the old WYSIWYG editor has been completely removed.
