# Privacy Policy

**Effective date:** 2026-03-15

Sable is an open-source Matrix client developed by 7w1.

It is designed to keep data collection to a minimum. Most of the app works on your device and communicates directly with the Matrix homeserver you choose.

## Who is responsible

For official Sable builds distributed by the project, the data controller is **7w1**.

Contact: **privacy@sable.moe**  
Project website: [**https://sable.moe**](https://sable.moe)

If you use a self-hosted, modified, or third-party build of Sable, that operator may use different diagnostics settings and may be responsible for their own privacy practices.

## What we collect

We only collect limited diagnostic data to help find bugs and improve the stability and security of the app.

Diagnostic data is sent only when error reporting is enabled.

This data may include:

- Crash and error details, such as exception type, stack trace, and error message
- Device, browser, or operating system name and version
- Application version and environment
- Anonymous performance information, such as page load, sync, or message-send timing

Before any diagnostic data is sent, sensitive values are scrubbed in the browser on your device.

## What we do not collect

Sable is designed not to collect or transmit:

- Matrix message content
- Room names or aliases
- User display names or avatars
- Contact lists or room member lists
- Authentication tokens or passwords
- Encryption keys or cryptographic session data
- IP addresses
- Precise or approximate location data

## Optional features

### Session replay

Session replay may be available for debugging, but it is **disabled by default** and must be turned on by the user.

When session replay is enabled, all text is masked, media is blocked, and form inputs are masked before any data leaves the device.

This is intended to ensure that Matrix messages, room names, user names, and other personal content are not visible in replays.

### Bug reports

You may choose to submit a bug report from within the app.

A bug report may include the description you write, platform and app version details, and optional diagnostic logs that you choose to attach.

Submitting a bug report is voluntary, and the app shows what will be sent before submission.

## Third-party services

Sable uses **Sentry** for crash reporting and performance diagnostics.

Sentry receives only the diagnostic data described in this policy.

Sentry handles that data under its own privacy policy:  
[**https://sentry.io/privacy/**](https://sentry.io/privacy/)

Technical details about Sable's Sentry integration are documented here:  
[**https://github.com/SableClient/Sable/dev/docs/SENTRY_PRIVACY.md**](https://github.com/SableClient/Sable/dev/docs/SENTRY_PRIVACY.md)

If a Sentry DSN is not configured, Sentry is inactive and no Sentry data is sent.

Self-hosted deployments may use a different Sentry instance or disable diagnostics entirely.

## Your controls

You can manage diagnostic features in: **Settings → General → Diagnostics & Privacy**

Depending on the build, you can disable error reporting, enable or disable session replay, and adjust breadcrumb categories.

### First-time consent notice

When a build has crash reporting configured, a notice appears the first time you open Sable. It explains that Sable can send anonymous crash reports to help fix bugs, and gives you the option to enable it. Dismissing the notice without enabling keeps crash reporting off.

This notice only appears once. Your choice is saved and can be changed at any time in **Settings → General → Diagnostics & Privacy**.

You can also stop all app-based data transmission by uninstalling the app.

## Legal basis

For users in the European Economic Area, diagnostic data is processed on the basis of legitimate interest for app reliability and security, and on the basis of consent where optional features such as session replay are explicitly enabled.

## Retention and transfers

Diagnostic data is stored by Sentry according to the retention settings of the Sentry project.

The Sable project does not keep a separate copy of that diagnostic data.

Because Sentry is a cloud service, diagnostic data may be processed outside your country of residence. Sentry states that it provides safeguards such as Standard Contractual Clauses where required.

## Children

Sable is not directed to children under 13.

We do not knowingly collect personal information from children through the app.

If you believe a child has submitted information through Sable, contact **privacy@sable.moe** so it can be removed.

## Changes to this policy

We may update this Privacy Policy from time to time.

When we do, we will publish the updated version at [**https://github.com/SableClient/Sable/blob/dev/docs/PRIVACY.md**](https://github.com/SableClient/Sable/blob/dev/docs/PRIVACY.md) and/or [**https://sable.moe**](https://sable.moe).

## Contact

If you have questions about this Privacy Policy or want to request deletion of data connected to a bug report, contact **privacy@sable.moe**.
