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

The helper drives two saved chats with the real composer and sidebar. It holds a mock turn to observe the SDK Working badge and count, switches to the idle chat, opens the working chat through the plugin's titlebar control, and releases the turn. It checks native menus and toggles the plugin through Capabilities → Plugins.

See [features](features/README.md). A failed or interrupted run is a failure. No stock-release compatibility, production inference, or hidden-chat counts are claimed.

## Evidence

`evidence/verification.json` records the checks and result; `working.png` captures the current UI. Failure evidence uses `failure.png` and `failure.txt`. The helper uses real gateway events and local mock inference. Review evidence before sharing it.

## Cleanup

The helper closes the Electron instance it launched, releases the held stream, closes its own mock server, and removes only its own temporary sandbox in `finally`. Evidence stays in the project directory. Never kill the user's Hermes process to clean up a test.

## Helpers

`node scripts/verify.mjs` is the single verification helper. `npm test` calls it. `npm run check` performs syntax validation only.
