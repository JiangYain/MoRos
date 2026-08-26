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
