import assert from "node:assert/strict";
import test from "node:test";
import { focusWindowForDictation, type DictationWindowTarget } from "../src/main/dictation-window.ts";

function createWindow(minimized: boolean): { target: DictationWindowTarget; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    target: {
      isMinimized: () => minimized,
      restore: () => calls.push("restore"),
      show: () => calls.push("show"),
      focus: () => calls.push("focus"),
      webContents: { focus: () => calls.push("webContents.focus") },
    },
  };
}

test("dictation preserves a visible window's maximized or fullscreen state", () => {
  const window = createWindow(false);
  focusWindowForDictation(window.target);
  assert.deepEqual(window.calls, ["show", "focus", "webContents.focus"]);
});

test("dictation restores a minimized window before focusing it", () => {
  const window = createWindow(true);
  focusWindowForDictation(window.target);
  assert.deepEqual(window.calls, ["restore", "show", "focus", "webContents.focus"]);
});
