# Session working state

Open Hermes's Sessions sidebar with Session Signal enabled. Run `node scripts/verify.mjs` for the installed-app journey.

The helper checks Working from SDK atoms, retained runtime/durable binding while focus moves away, navigation through `host.openSession`, completion clearing, native menus, absence of old core-row attributes/global stylesheet, and disable/re-enable cleanup.

Only plugin-owned elements carry `data-signal-session`, `data-signal-working`, or `data-signal-focused`. Counts include mounted rows with known busy bindings; they cycle by durable id. A remounted background row with distinct runtime/durable ids can omit Working until focused. Needs-input/unread labels and row restyling are not implemented.

Passing requires a successful receipt. Stock release builds, other platforms, and production model behavior require separate verification.
