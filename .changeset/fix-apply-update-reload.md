---
'charm': patch
---

Make the About page's `Apply Update` action wait for the new service worker takeover more reliably, including retrying the client-claim step when activation stalls so available updates reload into the new version immediately.
