import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const validator = join(root, "scripts/validate-content.mjs");
const samplePath = join(root, "content/samples/reading-demo.json");
const sample = JSON.parse(readFileSync(samplePath, "utf8"));

function runWithBook(book) {
  const dir = mkdtempSync(join(tmpdir(), "taalam-content-test-"));
  const file = join(dir, "book.json");
  try {
    writeFileSync(file, JSON.stringify(book), "utf8");
    return spawnSync(process.execPath, [validator, file], { encoding: "utf8" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("accepts the sample book and semantic content version", () => {
  const result = spawnSync(process.execPath, [validator, samplePath], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Content structure is valid/);
});

test("rejects an invalid semantic content version", () => {
  const book = structuredClone(sample);
  book.contentVersion = "demo-latest";
  const result = runWithBook(book);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /contentVersion/);
});

test("rejects unsupported activity types", () => {
  const book = structuredClone(sample);
  book.units[0].lessons[0].activities[0].type = "unsupported";
  const result = runWithBook(book);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unsupported activity type/);
});

test("rejects duplicate activity identifiers within a lesson", () => {
  const book = structuredClone(sample);
  book.units[0].lessons[0].activities[1].id = book.units[0].lessons[0].activities[0].id;
  const result = runWithBook(book);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /duplicate id/);
});

test("rejects missing required activity data", () => {
  const book = structuredClone(sample);
  delete book.units[0].lessons[0].activities[0].data;
  const result = runWithBook(book);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing "data"/);
});

test("rejects malformed JSON with a usage/data error exit code", () => {
  const dir = mkdtempSync(join(tmpdir(), "taalam-content-test-"));
  const file = join(dir, "broken.json");
  try {
    writeFileSync(file, "{ invalid json", "utf8");
    const result = spawnSync(process.execPath, [validator, file], { encoding: "utf8" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Cannot read valid JSON/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("prototype progress key remains isolated from production progress", () => {
  const html = readFileSync(join(root, "prototype/index.html"), "utf8");
  assert.match(html, /taalam:prototype:progress:v1:demo-book/);
  assert.match(html, /noindex,nofollow/);
  assert.match(html, /\.\.\/content\/samples\/reading-demo\.json/);
  assert.doesNotMatch(html, /taalam:progress:v1:demo-book/);
});
