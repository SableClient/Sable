---
applyTo: "src/**,Caddyfile,Dockerfile"
---

## Security

- Follow OWASP Top 10 guidance.
- No `innerHTML`, no `eval`; sanitise all user-supplied and Matrix-sourced content before rendering.
- Do not log or expose access tokens, room keys, or other secrets.
- Content Security Policy headers in `Caddyfile` and `Dockerfile` must not be weakened without a documented reason.
