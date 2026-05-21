# Contributing to Sable

First off, thanks for taking the time to contribute! ❤️

All types of contributions are encouraged and valued. Please make sure to read the relevant section before making your contribution. It will make it a lot easier for us maintainers and smooth out the experience for all involved. The community looks forward to your contributions. 🎉

> And if you like the project, but just don't have time to contribute, that's fine. There are other easy ways to support the project and show your appreciation, which we would also be very happy about:
>
> - Star the project
> - [Donate](https://opencollective.com/sable)! ❤️
> - Talk about it!
> - Refer this project in your project's readme
> - Mention the project at local meetups and tell your friends/colleagues

## Bug reports

Bug reports and feature suggestions must use descriptive and concise titles and be submitted to [GitHub Issues](https://github.com/SableClient/Sable/issues). Please use the search function to make sure that you are not submitting duplicates, and that a similar report or request has not already been resolved or rejected.

## Pull requests

> ### Legal Notice
>
> When contributing to this project, you must agree that you have authored 100% of the content, that you have the necessary rights to the content and that the content you contribute may be provided under the project license.

**NOTE: If you want to add new features, please discuss with maintainers before coding or opening a pull request.** This is to ensure that we are on same track and following our roadmap.

**Please use clean, concise titles for your pull requests.** We use commit squashing, so the final commit in the dev branch will carry the title of the pull request. For easier sorting in changelog, start your pull request titles using one of the verbs "Add", "Change", "Remove", or "Fix" (present tense).

Example:

| Not ideal                           | Better                                        |
| ----------------------------------- | --------------------------------------------- |
| Fixed markAllAsRead in RoomTimeline | Fix read marker when paginating room timeline |

It is not always possible to phrase every change in such a manner, but it is desired.

**The smaller the set of changes in the pull request is, the quicker it can be reviewed and merged.** Splitting tasks into multiple smaller pull requests is often preferable.

Also, we use [ESLint](https://eslint.org/) for clean and stylistically consistent code syntax, so make sure your pull request follow it.

**Pull requests are not merged unless all quality checks are passing.** At minimum, `format`, `lint`, `typecheck`, `knip`, and `tests` must all be green before a pull request can be merged. Run these locally before opening or updating a pull request:

- `pnpm run fmt:check`
- `pnpm run lint`
- `pnpm run typecheck`
- `pnpm run knip`
- `pnpm run test:run`

If your change touches logic with testable behaviour, please include tests. See [docs/TESTING.md](./docs/TESTING.md) for a guide on how to write them.

## Developer Certification of Origin (DCO)

> [!IMPORTANT]
> Note that only humans or predictable bots, for example @dependabot are allowed to sign-off. A autonomous AI-agent MUST never do so, as per [AGENTS.md](./AGENTS.md)

```
Developer Certificate of Origin
Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.

Everyone is permitted to copy and distribute verbatim copies of this
license document, but changing it is not allowed.


Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
```

To acknowledge you agreeing with this you can either sign-off each individual
(usually preferred) or sign of your pull request.

A sign-off looks like `Signed-off-by: Random J Developer <random@developer.example.org>`.

If you choose to do this for each commit you can either every time use `git commit -s` or
you can just put the `Signed-off-by: Random J Developer <random@developer.example.org>` as
last line in your commit message.

If you choose to do this for your pull request, just add `Signed-off-by: Random J Developer
<random@developer.example.org>` as last line of your PR description.

> [!NOTE]
> **Interpretation**: A note on the name  
> The name used in your sign-off does not need to be your legal name.  
> However it has to be connected to you. I.e. if you use `Moira` consistently
> across the web or in the community you are free to use that name in your sign-off
> even if it is not your legal name.  
> In short: A well-established, consistently used
> pseudonym or preferred name that firmly connects
> back to the contributor's identity is acceptable.
> Fully anonymous sign-offs or throw away identities
> would however not be acceptable.

**What does this actually mean**?

- You need to be the author and the copyright holder in order to license your code under the [License](./LICENSE)
- You are the author if you either authored the commit yourself entirely or made meaningfully creative modifications to code your AI has assisted you in creating.

> [!NOTE]
> **Interpretation** What the heck does "meaningfully creative modifications" mean?  
> Informal way of saying: you can be legally considered a author/copyright holder for your changes  
> If you use your own hands to write your commits without help by AI, you should be fine.  
> If you use AI and heavily modify the results (in creative ways) you should be fine ase well.  
> If you just ask Chat-GPT to code something for you and hit `commit`, that would most likely not satisfy this criterion.

**What does this NOT mean**?

- you lose the copyright/ownership of your code
- you can't reuse your own work under a different license
- you agreeing to a potential re-license in the future

## Restrictions on Generative AI Usage

We expect and appreciate authentic engagement in our community.

Do not post output from Large Language Models or similar generative AI as comments on GitHub, as such comments tend to be formulaic and low content.

If you use generative AI tools as an aid in developing code, ensure that you fully understand the proposed changes and can explain why they are the correct approach; additionally, you **must** disclose which parts of the code were:

- Fully generated by the AI tool.
- Written alongside the AI tool (examples: line completion, rewriting code generated by AI).

And, if the majority of the changes have been AI generated, explain what modifications or actions have you taken to ensure that the result is licensable and compatible with THE LICENSE

Make sure you have added value based on your personal competency to your contributions. Just taking some input, feeding it to an AI and posting the result is not of value to the project. We reserve the right to rigorously reject seemingly AI generated low-value contributions.

Maintainers may close issues and PRs that are not useful or productive, including those that are fully generated by AI. If a contributor repeatedly opens unproductive issues or PRs, they may be blocked.

### Attribution

> taken from linux's AI policy
> <https://github.com/torvalds/linux/blob/master/Documentation/process/coding-assistants.rst>

When AI tools contribute to the project development, proper attribution helps
track the evolving role of AI in the development process. Contributions should
include an Assisted-by tag in the following format::

```
Assisted-by: AGENT_NAME:MODEL_VERSION [TOOL1] [TOOL2]
```

Where:

- `AGENT_NAME` is the name of the AI tool or framework
- `MODEL_VERSION` is the specific model version used
- `[TOOL1] [TOOL2]` are optional specialized analysis tools used (e.g.,
  coccinelle, sparse, smatch, clang-tidy)

Basic development tools (git, gcc, make, editors) should not be listed.

Example:

```
Assisted-by: Claude:claude-3-opus coccinelle sparse
```

## Release notes and versioning (Knope)

We use [Knope](https://knope.tech/) with the Knope GitHub Bot to manage change documentation and releases. The workflow configuration lives in [`knope.toml`](./knope.toml).

If you have used [Changesets](https://github.com/changesets/changesets) before, Knope should feel very similar. The main difference is scope: Changesets is typically used for JavaScript repositories because it relies on `package.json`, while Knope is multi-language.

If you prefer, you can install the Knope CLI yourself using the [official installation guide](https://knope.tech/installation/). This repo also exposes the CLI through pnpm scripts, so you can run `pnpm run knope -- <subcommand>` (for example: `pnpm run knope -- document-change`). Otherwise, this repo installs Knope for you via `postinstall`, so running `pnpm i` is enough.

### Documenting a change

A changeset is a Markdown file (usually in `.changeset/`) that captures intent to change: the semver bump (`major`, `minor`, `patch`) and the user-facing release note text. Knope later combines all pending changesets to decide version bumps and generate changelog entries.

For user-facing pull requests, add one before requesting review.

CLI paths:

- `pnpm run document-change`
- `pnpm run knope -- document-change`
- `knope document-change` (if Knope is installed locally)

All commands open an interactive prompt; fill in the package, change type, and short summary, then commit the generated change file in your PR.

Alternatively, you can document the change manually by creating a change file:

1. Create a file named `.changeset/fix-room-timeline-pagination.md` (or another descriptive file name).
2. Copy and paste this Markdown into the file:

```md
---
default: patch
---

Short user-facing summary of the change.
```

3. Replace `patch` with one of: `major`, `minor`, `patch`, `docs`, or `note`.
4. Edit the summary so it describes user-facing impact (not maintainer-only details).

In this repo, the `internal` label skips Knope's documentation check (`[bot.checks].skip_labels`).

Further reading:

- https://github.com/knope-dev/changesets?tab=readme-ov-file#what-is-a-changeset
- https://github.com/changesets/changesets/blob/main/docs/detailed-explanation.md

### Release flow (GitHub Bot)

Releases are driven by Knope Bot (`[bot.releases].enabled = true`):

- The bot keeps an up-to-date release PR from `knope/release`.
- Merging that bot release PR publishes the GitHub release.

### Local validation and dry-run (optional)

Maintainers can preview behavior without changing files:

- `pnpm run knope -- release --dry-run`

You can also validate the local Knope config with:

- `pnpm run knope -- --validate`

**For any query or design discussion, join our [Matrix room](https://matrix.to/#/#sable:sable.moe).**

## Helpful links

- [BEM methodology](http://getbem.com/introduction/)
- [Atomic design](https://bradfrost.com/blog/post/atomic-web-design/)
- [Matrix JavaScript SDK documentation](https://matrix-org.github.io/matrix-js-sdk/index.html)
