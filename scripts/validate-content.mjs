#!/usr/bin/env node
/**
 * Structural validator for Algerian Taalam book JSON.
 * It checks the data contract, not curriculum accuracy or answer correctness.
 */
import { readFile } from "node:fs/promises";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/validate-content.mjs <book.json>");
  process.exit(2);
}

const errors = [];
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const required = (obj, keys, path) => {
  for (const key of keys) if (!(key in obj)) errors.push(`${path}: missing "${key}"`);
};
const validId = value => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const unique = (items, path) => {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item)) errors.push(`${path}: duplicate id "${item}"`);
    seen.add(item);
  }
};

let book;
try {
  book = JSON.parse(await readFile(file, "utf8"));
} catch (error) {
  console.error(`Cannot read valid JSON: ${error.message}`);
  process.exit(2);
}

if (!isObject(book)) errors.push("book: root must be an object");
else {
  required(book, ["schemaVersion", "bookId", "title", "curriculum", "grade", "language", "contentVersion", "units"], "book");
  if (book.schemaVersion !== "1.0.0") errors.push('book.schemaVersion: expected "1.0.0"');
  if (typeof book.contentVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(book.contentVersion)) errors.push("book.contentVersion: expected semantic version x.y.z");
  if (!validId(book.bookId)) errors.push("book.bookId: expected lowercase kebab-case id");
  if (typeof book.title !== "string" || !book.title.trim()) errors.push("book.title: expected non-empty string");
  if (book.curriculum !== "algerian") errors.push('book.curriculum: expected "algerian"');
  if (book.grade !== "primary-1") errors.push('book.grade: expected "primary-1"');
  if (!["ar", "en", "fr", "mixed"].includes(book.language)) errors.push("book.language: unsupported language");
  if (!Array.isArray(book.units)) errors.push("book.units: expected array");
  else {
    unique(book.units.map(item => item?.id).filter(Boolean), "book.units");
    for (const [ui, unit] of book.units.entries()) {
      const up = `units[${ui}]`;
      if (!isObject(unit)) { errors.push(`${up}: expected object`); continue; }
      required(unit, ["id", "title", "order", "lessons"], up);
      if (!validId(unit.id)) errors.push(`${up}.id: invalid id`);
      if (typeof unit.title !== "string" || !unit.title.trim()) errors.push(`${up}.title: expected non-empty string`);
      if (!Number.isInteger(unit.order) || unit.order < 1) errors.push(`${up}.order: expected positive integer`);
      if (!Array.isArray(unit.lessons)) { errors.push(`${up}.lessons: expected array`); continue; }
      unique(unit.lessons.map(item => item?.id).filter(Boolean), `${up}.lessons`);
      for (const [li, lesson] of unit.lessons.entries()) {
        const lp = `${up}.lessons[${li}]`;
        if (!isObject(lesson)) { errors.push(`${lp}: expected object`); continue; }
        required(lesson, ["id", "title", "order", "activities"], lp);
        if (!validId(lesson.id)) errors.push(`${lp}.id: invalid id`);
        if (typeof lesson.title !== "string" || !lesson.title.trim()) errors.push(`${lp}.title: expected non-empty string`);
        if (!Number.isInteger(lesson.order) || lesson.order < 1) errors.push(`${lp}.order: expected positive integer`);
        if (!Array.isArray(lesson.activities)) { errors.push(`${lp}.activities: expected array`); continue; }
        unique(lesson.activities.map(item => item?.id).filter(Boolean), `${lp}.activities`);
        for (const [ai, activity] of lesson.activities.entries()) {
          const ap = `${lp}.activities[${ai}]`;
          if (!isObject(activity)) { errors.push(`${ap}: expected object`); continue; }
          required(activity, ["id", "type", "instructions", "data", "media"], ap);
          if (!validId(activity.id)) errors.push(`${ap}.id: invalid id`);
          if (!["text", "image", "audio", "video", "multiple-choice", "true-false", "matching", "ordering", "fill-blank", "drawing"].includes(activity.type)) errors.push(`${ap}.type: unsupported activity type`);
          if (typeof activity.instructions !== "string") errors.push(`${ap}.instructions: expected string`);
          if (!isObject(activity.data)) errors.push(`${ap}.data: expected object`);
          if (!Array.isArray(activity.media)) errors.push(`${ap}.media: expected array`);
          else for (const [mi, media] of activity.media.entries()) {
            const mp = `${ap}.media[${mi}]`;
            if (!isObject(media)) { errors.push(`${mp}: expected object`); continue; }
            required(media, ["type", "src"], mp);
            if (!["image", "audio", "video"].includes(media.type)) errors.push(`${mp}.type: unsupported media type`);
            if (typeof media.src !== "string" || !media.src.trim()) errors.push(`${mp}.src: expected non-empty string`);
          }
        }
      }
    }
  }
}

if (errors.length) {
  console.error(`Content validation failed (${errors.length} issue(s)):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Content structure is valid: ${file}`);
console.log(`Book: ${book.title} | Units: ${book.units.length}`);
