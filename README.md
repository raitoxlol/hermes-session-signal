# Session Signal

Working labels and session navigation for Hermes Desktop, using the public desktop plugin SDK.

**v0.3.0 · MIT**

## What it does

- Adds a plain Working label in the session-row trailing slot while the SDK reports a busy turn.
- Shows a titlebar Working count for matching mounted rows. Click it to open the next working session through `host.openSession`. Cycling uses durable session-id order, not sidebar DOM order.
- Leaves native row sizes, titles, dots, menus, opacity, and selection styling under Hermes control. Choose row density in Hermes's own Appearance settings.

Input and Done labels and their attention counts are deferred until the SDK provides read-only needs-input and unread state, requested in [hermes-agent#152528](https://github.com/NousResearch/hermes-agent/issues/152528). Working describes a busy turn, not task success or a background terminal process.

## Install

Once the catalog entry is approved and available in your Hermes catalog:

```sh
hermes plugins install hermes-session-signal
```

Accept the enable prompt, then open Hermes Desktop. You can also find Session Signal in **Capabilities → Plugins**. The catalog installs the reviewed commit. The listing is currently under review at [hermes-agent#151755](https://github.com/NousResearch/hermes-agent/pull/151755).

Requires a Desktop build exposing `host.state.busyBySession`, `focusedSessionId`, `focusedStoredSessionId`, `host.openSession`, and session-row/titlebar contribution slots. No build or npm install is needed for users. The runtime imports are `@hermes/plugin-sdk` and React, supplied by Hermes.

Disable Session Signal in **Capabilities → Plugins** to remove its contributions. Manage uninstall through Hermes's plugin controls. Sessions remain owned by Hermes.

## Scope and data behavior

The plugin reads SDK atoms and renders only its own row badge and titlebar control. It does not inspect native DOM, add attributes to core elements, inject CSS, or observe row mutations. It adds no inference, telemetry, direct network calls, credentials, or persistent storage. Opening a chat uses Hermes's SDK navigation and normal session behavior.

Counts include mounted row contributions only. Collapsed groups, filtered-out rows, unloaded history, and Bot Mode roster rows are excluded. Labels are currently English.

The busy map uses runtime ids and row slots use durable ids. While a row is focused, the plugin remembers the SDK's focused runtime/durable pair, including subsequent runtime changes, and retains that binding when focus moves away. Before that pair is observed, only an exact id match can produce a Working badge. A remounted background row whose runtime id differs from its durable id may omit Working until focused again. No DOM fallback is used; the requested SDK status API should resolve this limitation too.

## Development and verification

Use Node.js 22 or newer:

```sh
npm run check
SIGNAL_HERMES_ROOT=/absolute/path/to/hermes-agent npm test
```

The UI test requires macOS, `/Applications/Hermes.app`, and a Hermes source checkout with its JavaScript test dependencies and Python environment installed through Hermes's own setup. Without `SIGNAL_HERMES_ROOT`, it uses `~/.hermes/hermes-agent`. `SIGNAL_EVIDENCE_DIR` overrides the default `evidence/` directory.

The verifier launches the installed app with an isolated Hermes home/backend and local mock inference. It checks SDK Working state, background focus changes, SDK navigation, completion, native menus, and disable/re-enable cleanup. It closes only its own app and removes its own sandbox. `npm run check` and the GitHub workflow perform syntax checks only.

The [verification receipt](docs/verification.json) records the current run and its limits. This verifies the installed local macOS build, not all stock releases or operating systems. Historical v0.2.0 screenshots in `assets/` depict the retired DOM-based implementation and are not demonstrations of v0.3.0. See the [verification skill](.agents/skills/verify-session-signal/SKILL.md).

## Credits

Inspired by [T3 Code](https://github.com/pingdotgg/t3code). See [third-party notices](THIRD_PARTY_NOTICES.md) for the upstream MIT notice. Unofficial; not affiliated with Nous Research or T3 Tools.

Session Signal is licensed under [MIT](LICENSE).
