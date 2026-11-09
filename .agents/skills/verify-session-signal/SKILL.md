---
name: verify-session-signal
description: Verify the Session Signal Hermes desktop plugin in the installed macOS app with an isolated backend and local mock inference.
---

# Verify Session Signal

## Launch

Run `node scripts/verify.mjs` with the project root as the working directory. `SIGNAL_HERMES_ROOT` selects the Hermes source checkout; the default is `~/.hermes/hermes-agent`. The installed app at `/Applications/Hermes.app` supplies the renderer. The script creates its own home, user data, and mock server. See the README for source checkout prerequisites.

## Doctor

Run `node --check desktop/plugin.js`. Confirm the installed Hermes app and the source checkout's `node_modules/tsx/dist/esm/api/index.mjs` exist. Do not rebuild Hermes. The launch must set `HERMES_DISABLE_LAZY_INSTALLS=1`; otherwise this machine's source-update completion path can trigger an unrelated application rebuild.

## Drive

The helper drives four saved chats using the real composer and sidebar. It holds one mock stream to observe Working and background dimming, releases it to observe real unread completion, clicks the attention strip to acknowledge it, and submits three blocking clarify requests. It toggles the plugin through Capabilities → Plugins.

See [features](features/README.md). Treat a failed or interrupted run as a failure. No production provider inference or hidden-chat counts are claimed.

## Evidence

`evidence/verification.json` records each passed check and the overall result. Numbered full-window screenshots record the states. `07-working-sidebar.png` and `08-attention-sidebar.png` capture the actual sidebar region directly for public demo assets, excluding the transcript. Failure evidence uses `failure.png` and `failure.txt`. The current helper uses real gateway events and a local mock provider; it does not replace the renderer's session state with test setters. Review all evidence before sharing it.

## Cleanup

The helper closes the Electron instance it launched, releases the held stream, closes its own mock server, and removes only its own temporary sandbox in `finally`. Evidence stays in the project directory. Never kill the user's Hermes process to clean up a test.

## Helpers

`node scripts/verify.mjs` is the single verification helper. `npm test` calls it. `npm run check` performs syntax validation only.
