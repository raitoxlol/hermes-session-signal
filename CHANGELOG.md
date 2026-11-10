# Changelog

## 0.3.0 — 2026-11-10

- Replace native DOM status detection and synthetic clicks with SDK atoms and `host.openSession`.
- Remove native-row styling, mutation observers, and injected CSS. Hermes controls row density.
- Defer Input/Done until a read-only SDK status API exists; retain Working labels and navigation.
- Document runtime/durable id binding limits and the catalog installation path.
- Re-run the installed-app verifier against the revised behavior.

## 0.2.0 — 2026-10-24

First prepared public release. Builds on the earlier local prototype.

- T3 Code inspired slim rows, plain status labels, and medium-weight selected/attention titles.
- Working/background dimming at 70%; idle/draft dimming at 55%; hover, focus, and selection restore full visibility.
- Native Input/Done attention navigation, including cycling and wrapping through three or more input requests.
- Native Comfortable, Detailed, and Inbox geometry preserved; theme-aware colors and complete disable cleanup.
- Portable developer verifier, isolated demo captures, compatibility documentation, MIT license, and T3 attribution.

Tested on a local macOS Hermes Desktop build stamped at `77e2992020eafded09e0c344e687ae53e52e6eab` with local modifications; its UI reported v0.21.5+4701. Stock release compatibility is unverified. Snooze/wake and elapsed Working time are not included.
