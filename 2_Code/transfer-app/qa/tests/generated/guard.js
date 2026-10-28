// Safety guard for AI-written tests. Every generated test must import { test, expect } from './guard'.
// It blocks any request to the app that could change data (anything except GET/HEAD/OPTIONS),
// so a generated test can never submit, approve, upload or delete, even against production.
const base = require('@playwright/test');

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

const test = base.test.extend({
  page: async ({ page, baseURL }, use) => {
    const origin = new URL(baseURL).origin;
    const blocked = [];
    await page.route('**/*', (route) => {
      const req = route.request();
      if (req.url().startsWith(origin) && !SAFE.has(req.method())) {
        blocked.push(`${req.method()} ${new URL(req.url()).pathname}`);
        return route.fulfill({ status: 418, contentType: 'application/json', body: '{"error":"Blocked by QA read-only guard"}' });
      }
      return route.continue();
    });
    await use(page);
    if (blocked.length) console.log(`[guard] blocked write requests: ${blocked.join(', ')}`);
  },
  request: async ({ playwright, baseURL }, use) => {
    const ctx = await playwright.request.newContext({ baseURL });
    const readOnly = new Proxy(ctx, {
      get(target, prop) {
        if (['post', 'put', 'patch', 'delete'].includes(prop)) {
          return async () => { throw new Error(`Blocked by QA read-only guard: request.${String(prop)}()`); };
        }
        if (prop === 'fetch') {
          return (url, opts = {}) => {
            if (opts.method && !SAFE.has(String(opts.method).toUpperCase())) throw new Error(`Blocked by QA read-only guard: ${opts.method}`);
            return target.fetch(url, opts);
          };
        }
        const v = target[prop];
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
    await use(readOnly);
    await ctx.dispose();
  },
});

module.exports = { test, expect: base.expect };
