# Adding an app notification

Every new notification kind must ship with a separate user-owned database ON/OFF setting, default OFF, a general-settings switch, a fresh activation baseline/cursor, and an activation epoch. Do not add a producer without these controls.

Use the persistent event/delivery ledger and per-user preference lock. Recheck the current setting, epoch, device binding and live authenticated session immediately before transport. OFF/re-enable must cancel old generations and never replay the disabled interval. Use one stable event identity for retries and Android deduplication. Never include account numbers, amounts or raw push tokens in content/logs.

Add a server-defined allowlisted destination, authenticated event ownership check, native per-kind setting filter, permission handling, and cold/login launch coverage. Unknown destinations must be rejected. Extend the real DB concurrency/OFF/ownership tests and both viewport settings tests. Distinguish FCM acceptance, local emulator display, and real device delivery in operational reports.
