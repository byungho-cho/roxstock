# DART recovery QA — 2026-10-09

- Backend TypeScript: pass; backend build: pass.
- Backend unit/route suite: 151 pass. XML/ZIP success, 010/011/020 error XML, empty/malformed response, safe error classification, distinct long codes, secondary persistence failure and secret redaction covered.
- Local isolated MariaDB 13.0.2: migrations applied, exact 21/24-character codes stored, SUCCESS/NO_FILING and filing contents preserved, empty/invalid/no-match mapping input rejected, transaction failure after mapping insert rolls back mappings and timestamp; normal replacement succeeds.
- CI passed the same isolated integration test against production-compatible MariaDB 11.8.9, strict SQL mode. Production data is not used in tests.
- Tests use synthetic external responses. Real corporation response and limited manual collection are verified after deployment, reported separately.
- Current production mappings=0; the historical cause is unknown. This fix prevents the verified unsafe paths, without claiming the actual prior response was empty or quota-limited.


## Operating verification — 2026-10-09 KST

- Fix PR #145 merged as `1c93ffed9c8c24814f8ae552f9e60899c06386fc`; backend and DART worker run that immutable image.
- Migration `20261009000000_dart_error_code_contract` finished at 08:22:47 KST. information_schema confirms error_code capacity 64; no rollback recorded.
- Pre/post filing fingerprints: 26,640 / 26,640; missing 0; changed 0; added 0. Server-local before/after hashes are beside the verified backup at `/root/roxstock-backups/dart-recovery-20261009/`.
- Mapping recovery remains blocked: 0 before / 0 after. Normal worker run #1052 and explicit recovery command both report DART_API / CORP_FETCH / 800 with sanitized diagnostics, not P2000 or UNKNOWN. No mapping replacement was attempted on the error response.
- Official OPENDART notice says the corporation-code API is suspended for maintenance from 2026-10-08 20:00 until 2026-10-11 18:00: https://opendart.fss.or.kr/ . This explains the current recovery block; the historical cause of zero mappings remains unconfirmed.
- Hyundai Motor (240 / 005380) and Samsung Electronics (262 / 005930) already have 2025 Q2 filings. Their real manual refresh success test is **not performed** because mappings have not recovered. No full recollection or synthetic production mapping was used.
- Remaining: after the external service returns, verify one normal corporation response and mapping sync, then request only these two stocks / 2025 Q2 through the existing manual API. Recheck filing preservation and status. No task-history reset is needed or authorized by this procedure.
- Local backend suite 151 passed. CI real MariaDB 11.8.9 integration passed. Existing mocked-browser suites: Manual Collector 69 passed; phase 9/10 92 passed. These are separate from the blocked live-source success test.
