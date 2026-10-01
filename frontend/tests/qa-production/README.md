# Production home QA

This suite performs read-only evidence collection against the deployed RoxStock site. It does not start Vite, publish images, deploy code, or mutate application data.

## Manual run

1. Open **Actions → Production Home QA → Run workflow**.
2. Select the branch that contains the workflow.
3. Set `test_ref` to the branch, tag, or commit containing the QA test code.
4. Keep `target_url` as `https://newrox.cafe24.com` unless an explicitly approved read-only target is required.
5. Download all four artifacts after every matrix job finishes.

The GitHub connector available to Work can inspect workflow runs for a known commit, list run artifacts, and download an artifact ZIP. It does not currently expose a workflow-dispatch action, so starting the run must be done from GitHub Actions or by another authorized GitHub client.

## Evidence

Each viewport artifact contains:

- `01-home-initial-viewport.png`
- `01-home-initial-full-page.png`
- `02-home-bottom-viewport.png`
- Playwright trace and video
- `execution-info.json`
- HTML and JSON reports

The four projects are:

- `cover-required-370x465`
- `unfolded-required-725x396`
- `cover-responsive-400x640`
- `unfolded-responsive-816x616`

## Version interpretation

`QA_TEST_SHA` is the checked-out test-code commit. It must not be reported as the production deployment commit. The test records response headers and loaded script asset URLs as deployment evidence, but leaves the production commit or image tag unverified unless the application exposes authoritative version metadata.

## Safety

Only navigation, scrolling, screenshots, browser metrics, console logs, and response status are tested. Registration, modification, deletion, reset, and form submission remain excluded from production QA.
