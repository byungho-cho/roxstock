# DART recovery QA — 2026-10-09

- Backend TypeScript: pass; backend build: pass.
- Backend unit/route suite: 150 pass. XML/ZIP success, 010/011/020 error XML, empty/malformed response, safe error classification, distinct long codes, secondary persistence failure and secret redaction covered.
- Local isolated MariaDB 13.0.2: migrations applied, exact 21/24-character codes stored, SUCCESS/NO_FILING and filing contents preserved, empty/invalid/no-match mapping input rejected, transaction failure after mapping insert rolls back mappings and timestamp; normal replacement succeeds.
- CI adds the same isolated integration test against production-compatible MariaDB 11.8.9, strict SQL mode. Production data is not used in tests.
- Tests use synthetic external responses. Real corporation response and limited manual collection are verified after deployment, reported separately.
- Current production mappings=0; the historical cause is unknown. This fix prevents the verified unsafe paths, without claiming the actual prior response was empty or quota-limited.
