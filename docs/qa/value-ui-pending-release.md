# Pending value-analysis UI release — 2026-10-09

- Value analysis accepts Korean initial-consonant and mixed literal/initial searches while preserving name/code matching.
- Remove selected-card border highlight; center market label with KOSPI yellow and KOSDAQ green.
- Financial refresh dialog uses 24px side margins and 16px vertical margins within the viewport.
- Latest main includes the definitive DART collector fix. The old local code-truncation experiment is excluded.

Validation: backend/frontend TypeScript and builds pass; search helper/API tests 5 pass; existing search and refresh-dialog browser regressions 4 pass at 370x465 and 725x396. Browser checks use mocked data, not live collection. Frontend build retains its existing bundle-size warning.

No collection policy, production data or draft analysis/operations PR changes. PR merge starts the existing automated deployment; production completion is not awaited per the user's standing instruction.
