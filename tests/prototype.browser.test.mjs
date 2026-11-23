import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
let server, browser, baseUrl;
before(async () => {
  server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, "http://localhost").pathname;
      const files = {
        "/": ["index.html", "text/html; charset=utf-8"],
        "/index.html": ["index.html", "text/html; charset=utf-8"],
        "/book.html": ["book.html", "text/html; charset=utf-8"],
        "/prototype/index.html": ["prototype/index.html", "text/html; charset=utf-8"],
        "/content/books/taallamati-aloula-preparatory-arabic/book.json": ["content/books/taallamati-aloula-preparatory-arabic/book.json", "application/json; charset=utf-8"],
        "/content/samples/reading-demo.json": ["content/samples/reading-demo.json", "application/json; charset=utf-8"]
      };
      if (!files[path]) { res.writeHead(404); res.end("Not found"); return; }
      const [relative, type] = files[path], content = await readFile(resolve(root, relative));
      res.writeHead(200, { "content-type": type, "cache-control": "no-store" }); res.end(content);
    } catch { res.writeHead(500); res.end("Server error"); }
  });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); if (server) await new Promise(done => server.close(done)); });

test("homepage loads the current preparatory book and live catalog counts", async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  await page.goto(baseUrl);
  await page.locator("#activity-count").waitFor();
  assert.match(await page.locator("#book-title").innerText(), /تعلماتي الأولى/);
  assert.equal(await page.locator("#activity-count").innerText(), "75");
  assert.equal(await page.locator("#reviewed-count").innerText(), "15");
  assert.equal(await page.locator(".unit").count(), 2);
  const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  assert.ok(dimensions.content <= dimensions.viewport, `Homepage horizontal overflow: ${JSON.stringify(dimensions)}`);
  await page.close();
});

test("book index renders all source activities and exposes image references when available", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${baseUrl}/book.html`);
  await page.locator(".activity").first().waitFor();
  assert.match(await page.locator("#title").innerText(), /تعلماتي الأولى/);
  assert.equal(await page.locator(".activity").count(), 75);
  assert.equal(await page.locator(".activity img").count(), 0, "No media has been linked to the JSON yet; keep this explicit until assets are committed.");
  const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  assert.ok(dimensions.content <= dimensions.viewport, `Book page horizontal overflow: ${JSON.stringify(dimensions)}`);
  await page.close();
});

test("isolated prototype still renders and keeps demo progress separate", async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  await page.goto(`${baseUrl}/prototype/index.html`);
  await page.locator(".unit").waitFor();
  assert.match(await page.locator("#book-title").innerText(), /نموذج تقني توضيحي/);
  await page.locator('[data-option="option-a"]').click();
  assert.match(await page.locator(".status").innerText(), /اختيار صحيح/);
  await page.locator('[data-complete="lesson-demo-01"]').click();
  assert.equal(await page.locator('[data-complete="lesson-demo-01"]').isDisabled(), true);
  const stored = await page.evaluate(() => ({
    progress: JSON.parse(localStorage.getItem("taalam:prototype:progress:v1:demo-book")),
    productionKey: localStorage.getItem("taalam:progress:v1:demo-book")
  }));
  assert.deepEqual(stored.progress.completedLessons, ["lesson-demo-01"]);
  assert.equal(stored.productionKey, null);
  await page.close();
});
