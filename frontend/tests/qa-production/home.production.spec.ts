import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

type CheckStatus = 'passed' | 'failed' | 'not-applicable';

const kstNow = () => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul',
  dateStyle: 'short',
  timeStyle: 'medium',
}).format(new Date());

async function waitForHome(page: Page) {
  await page.getByRole('heading', { name: '대시보드' }).waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByText('보유종목', { exact: true }).first().waitFor({ state: 'visible', timeout: 15_000 });
}

async function visibleButton(page: Page, text: string) {
  return page.locator('button:visible').filter({ hasText: text }).first();
}

test('production home viewport evidence and read-only navigation', async ({ page, browserName }, testInfo: TestInfo) => {
  const startedAtKst = kstNow();
  const consoleErrors: string[] = [];
  const failedApiRequests: Array<Record<string, unknown>> = [];
  const checks: Array<{ name: string; status: CheckStatus; detail?: unknown }> = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && ['fetch', 'xhr'].includes(response.request().resourceType())) {
      failedApiRequests.push({ url: response.url(), status: response.status(), method: response.request().method() });
    }
  });
  page.on('requestfailed', (request) => {
    if (['fetch', 'xhr'].includes(request.resourceType())) {
      failedApiRequests.push({ url: request.url(), method: request.method(), failure: request.failure()?.errorText });
    }
  });

  const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
  let dataCondition = 'dashboard data loaded';
  try {
    await waitForHome(page);
    checks.push({ name: 'home-data-ready', status: 'passed' });
  } catch (error) {
    dataCondition = 'empty, slow, or failed dashboard response';
    checks.push({ name: 'home-data-ready', status: 'failed', detail: String(error) });
  }

  const initialMetrics = await page.evaluate(() => {
    const header = document.querySelector('header');
    const main = document.querySelector('main');
    const nav = [...document.querySelectorAll<HTMLElement>('.MuiBottomNavigation-root')]
      .find((element) => getComputedStyle(element).display !== 'none');
    const rect = (element: Element | null | undefined) => element?.getBoundingClientRect().toJSON() ?? null;
    const mainStyle = main ? getComputedStyle(main) : null;
    return {
      innerWidth,
      innerHeight,
      devicePixelRatio,
      visualViewport: window.visualViewport ? {
        width: window.visualViewport.width,
        height: window.visualViewport.height,
        scale: window.visualViewport.scale,
      } : null,
      screenOrientation: screen.orientation?.type ?? null,
      header: rect(header),
      main: rect(main),
      nav: rect(nav),
      mainOverflowY: mainStyle?.overflowY ?? null,
      mainScrollTop: main?.scrollTop ?? null,
      mainClientHeight: main?.clientHeight ?? null,
      mainScrollHeight: main?.scrollHeight ?? null,
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      bodyOverflow: getComputedStyle(document.body).overflow,
      scriptAssets: [...document.scripts].map((script) => script.src).filter(Boolean),
      accountControls: [...document.querySelectorAll('[role="combobox"]')].map((element) => element.textContent?.trim()).filter(Boolean),
    };
  });

  await page.screenshot({ path: testInfo.outputPath('01-home-initial-viewport.png') });
  await page.screenshot({ path: testInfo.outputPath('01-home-initial-full-page.png'), fullPage: true });

  expect.soft(initialMetrics.innerWidth).toBe(testInfo.project.use.viewport?.width);
  expect.soft(initialMetrics.innerHeight).toBe(testInfo.project.use.viewport?.height);
  expect.soft(initialMetrics.header?.height).toBe(44);
  expect.soft(initialMetrics.nav?.height).toBe(44);
  expect.soft(initialMetrics.horizontalOverflow).toBe(false);
  expect.soft(initialMetrics.bodyOverflow).toBe('hidden');
  expect.soft(initialMetrics.mainOverflowY).toMatch(/auto|scroll/);

  const main = page.locator('main');
  const maxScroll = await main.evaluate((element) => element.scrollHeight - element.clientHeight);
  await main.evaluate((element) => element.scrollTo({ top: element.scrollHeight, behavior: 'instant' }));
  await page.waitForTimeout(250);

  const bottomMetrics = await page.evaluate(() => {
    const header = document.querySelector('header');
    const main = document.querySelector('main');
    const nav = [...document.querySelectorAll<HTMLElement>('.MuiBottomNavigation-root')]
      .find((element) => getComputedStyle(element).display !== 'none');
    return {
      headerTop: header?.getBoundingClientRect().top ?? null,
      navBottom: nav ? innerHeight - nav.getBoundingClientRect().bottom : null,
      mainScrollTop: main?.scrollTop ?? null,
      mainScrollHeight: main?.scrollHeight ?? null,
      mainClientHeight: main?.clientHeight ?? null,
    };
  });

  await page.screenshot({ path: testInfo.outputPath('02-home-bottom-viewport.png') });

  if (maxScroll > 0) {
    const topButton = page.getByRole('button', { name: '맨 위로' });
    const visible = await topButton.isVisible().catch(() => false);
    checks.push({ name: 'scroll-top-button-visible', status: visible ? 'passed' : 'failed' });
    expect.soft(visible).toBe(true);
    if (visible) {
      await topButton.click();
      await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBeLessThanOrEqual(1);
      checks.push({ name: 'scroll-top-button-action', status: 'passed' });
    }
  } else {
    checks.push({ name: 'scroll-top-button', status: 'not-applicable', detail: 'main has no vertical overflow at this viewport/data condition' });
  }

  expect.soft(bottomMetrics.headerTop).toBe(initialMetrics.header?.top);
  expect.soft(bottomMetrics.navBottom).toBe(0);

  const routeChecks: Array<{ control: string; actualUrl?: string; status: CheckStatus; error?: string }> = [];
  const controls = ['평가자산', '주식평가액', '예수금', '자산 추이', '보유종목 전체 보기', '거래등록',
    '종목목록', '매매일지', '홈', '자산분석', '더보기'];

  for (const control of controls) {
    try {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await waitForHome(page);
      const button = await visibleButton(page, control);
      if (await button.count() === 0) {
        routeChecks.push({ control, status: 'not-applicable', error: 'visible control not present for this viewport' });
        continue;
      }
      await button.click();
      await page.waitForTimeout(150);
      routeChecks.push({ control, actualUrl: page.url(), status: page.url() === new URL('/', testInfo.project.use.baseURL as string).href ? 'failed' : 'passed' });
    } catch (error) {
      routeChecks.push({ control, status: 'failed', error: String(error) });
    }
  }

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const endedAtKst = kstNow();
  const metadata = {
    testName: testInfo.title,
    project: testInfo.project.name,
    startedAtKst,
    endedAtKst,
    targetUrl: testInfo.project.use.baseURL,
    testCodeSha: process.env.QA_TEST_SHA ?? process.env.GITHUB_SHA ?? 'unknown',
    workflowRun: {
      id: process.env.GITHUB_RUN_ID ?? null,
      attempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
      refInput: process.env.QA_TEST_REF ?? null,
    },
    productionDeployment: {
      confirmedCommitOrImageTag: null,
      status: 'unverified',
      evidence: {
        responseHeaders: response ? {
          etag: response.headers()['etag'] ?? null,
          lastModified: response.headers()['last-modified'] ?? null,
          server: response.headers()['server'] ?? null,
        } : null,
        scriptAssets: initialMetrics.scriptAssets,
      },
    },
    browser: { name: browserName, userAgent: await page.evaluate(() => navigator.userAgent) },
    viewport: initialMetrics,
    keyboardVisible: 'not-measured-in-headless-browser',
    accountAndDataCondition: {
      selectedAccount: initialMetrics.accountControls.length ? initialMetrics.accountControls : 'not exposed on home',
      condition: dataCondition,
    },
    checks,
    routeChecks,
    consoleErrors,
    failedApiRequests,
  };

  await mkdir(testInfo.outputPath('.'), { recursive: true });
  await writeFile(testInfo.outputPath('execution-info.json'), JSON.stringify(metadata, null, 2), 'utf8');
  await testInfo.attach('execution-info', { body: JSON.stringify(metadata, null, 2), contentType: 'application/json' });

  expect.soft(consoleErrors, 'browser console errors').toEqual([]);
  expect.soft(failedApiRequests, 'failed API requests').toEqual([]);
});
