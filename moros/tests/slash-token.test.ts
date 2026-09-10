import assert from "node:assert/strict";
import test from "node:test";
import { findSlashToken, replaceSlashToken } from "../src/renderer/src/components/composer/slash-token.ts";

test("finds a slash command token after ordinary prose", () => {
  assert.deepEqual(findSlashToken("请帮我执行 /skill:pho"), {
    query: "skill:pho",
    start: 6,
    end: 16,
  });
});

test("replaces only the active slash token", () => {
  const text = "请帮我执行 /skill:pho";
  const token = findSlashToken(text);
  assert.ok(token);
  assert.equal(replaceSlashToken(text, token, "/skill:repo-review"), "请帮我执行 /skill:repo-review ");
  assert.equal(findSlashToken("https://example.com/path"), null);
});

test("finds a slash inserted before existing text using the caret position", () => {
  assert.deepEqual(findSlashToken("我使用 /我", 5), {
    query: "",
    start: 4,
    end: 5,
  });
});

test("filters by the text before the caret and preserves the suffix on selection", () => {
  const text = "请用 /skill:repo 检查这个项目";
  const token = findSlashToken(text, 14);
  assert.deepEqual(token, { query: "skill:repo", start: 3, end: 14 });
  assert.equal(replaceSlashToken(text, token!, "/skill:repo-review"),
    "请用 /skill:repo-review  检查这个项目");
});

test("ignores slash tokens away from the caret and slashes inside URLs", () => {
  assert.equal(findSlashToken("先看这里 /skill:repo", 3), null);
  assert.equal(findSlashToken("https://example.com/path", 8), null);
});
