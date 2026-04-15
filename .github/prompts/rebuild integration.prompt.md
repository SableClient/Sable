---
name: rebuild integration
description: When asked to rebuild integration, or if there are large numbers of changes to branches
---

<!-- Tip: Use /create-prompt in chat to generate content with agent assistance -->

Please rebuild the `integration` branch, by deleting `integration` and then creating a new `integration` branch from `dev`, after updating `dev` from `upstream/dev` (and push `dev` to `origin/dev`). This is needed because there are large numbers of changes to branches, and rebuilding the integration branch will help to ensure that it is up to date with the latest changes.

Please prompt for which branches to include, and always include `personal/config`, as it is needed for the integration branch to work properly. If there are any other branches that need to be included, please prompt for those as well.

We should also ensure that any necessary tests are run after rebuilding the integration branch, to verify that everything is working correctly. Please let me know if you have any questions or need any assistance with this process.