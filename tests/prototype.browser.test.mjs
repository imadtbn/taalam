import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
let server;
let browser;
let baseUrl;

before(async () => {
  server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, "http://localhost").pathname;
      const files = {
        "/prototype/index.html": ["prototype/index.html", "text/html; charset=utf-8"],
        "/content/samples/reading-demo.json": ["content/samples/reading-demo.json", "application/json; charset=utf-8"]
      };
      if (!files[path]) { res.writeHead(404); res.end("Not found"); return; }
      const [relative, type] = files[path];
      const content = await readFile(resolve(root, relative));
      res.writeHead(200, { "content-type": type });
      res.end(content);
    } catch {
      res.writeHead(500);
      res.end("Server error");
    }
  });
  await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise(resolveClose => server.close(resolveClose));
});

test("book prototype renders, responds, persists progress, and fits mobile viewport", async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  await page.goto(`${baseUrl}/prototype/index.html`);
  await page.locator(".unit").waitFor();

  assert.match(await page.locator("#book-title").innerText(), /نموذج تجريبي/);
  assert.equal(await page.locator(".unit h2").count(), 1);
  assert.equal(await page.locator(".lesson h3").count(), 1);

  await page.locator('[data-option="option-a"]').click();
  assert.match(await page.locator(".status").innerText(), /اختيار صحيح/);

  await page.locator('[data-complete="lesson-demo-01"]').click();
  assert.equal(await page.locator('[data-complete="lesson-demo-01"]').isDisabled(), true);

  const stored = await page.evaluate(() => ({
    progress: JSON.parse(localStorage.getItem("taalam:prototype:progress:v1:reading")),
    productionKey: localStorage.getItem("taalam:progress:v1:reading")
  }));
  assert.deepEqual(stored.progress.completedLessons, ["lesson-demo-01"]);
  assert.equal(stored.productionKey, null);

  await page.reload();
  assert.equal(await page.locator('[data-complete="lesson-demo-01"]').isDisabled(), true);

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }));
  assert.ok(dimensions.content <= dimensions.viewport, `Horizontal overflow: ${JSON.stringify(dimensions)}`);
  await page.close();
});
