# Session attention

## Sub-features

T3 slim-row geometry, title truncation, inactive dimming, working dimming, plain status labels, visible-chat counts, native navigation, keyboard focus, density settings, Inbox layout, light and dark appearance, and disable cleanup.

## How to get to it (user POV)

Open Hermes's Sessions sidebar with Session Signal enabled. Run work in one chat while looking at another. The titlebar strip appears when a mounted row requires input or has an unread completion.

## Driving it with Playwright

Run `node scripts/verify.mjs`. Use the real visible `[data-composer-target]` surface when entering prompts; keep-alive chats leave hidden composer nodes in the DOM. The sidebar New session button opens a new tab. Chat rows carry `data-session-signal` while the plugin is active.

The helper checks computed geometry and opacity, real background completion, three simultaneous blocking clarify requests, all three density settings, the native Inbox switch, both system color modes, and the Capabilities → Plugins switch. Passing requires a successful result receipt and screenshots that survive sandbox cleanup. Set `SIGNAL_EVIDENCE_DIR` for a separate run directory.

## Gotchas

Counts exclude collapsed or unloaded rows. Input combines clarify and approvals because Hermes's native state combines them. Completion is an unread-state signal, not task-success certification. Runtime and stored identifiers differ; the row slot supplies the durable identifier. Track a chat by that identifier because an idle row can become unread after a delayed completion event. Inbox's checkbox leaves its menu open, so dismiss the menu before finding the Filters button again.

The stylesheet must survive the Settings overlay. Verify Compact after switching through Comfortable and Detailed while Settings is open. Disabling must remove `#hermes-session-signal-style` and every `data-signal-*` attribute. Re-enabling must create one stylesheet. Recheck native labels, title markup, and `host.settings` after app updates.
