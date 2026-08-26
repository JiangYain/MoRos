import assert from "node:assert/strict";
import test from "node:test";
import { focusWindowForDictation, type DictationWindowTarget } from "../src/main/dictation-window.ts";

function createWindow(
  minimized: boolean,
  initiallyVisible = !minimized,
): { target: DictationWindowTarget; calls: string[] } {
  const calls: string[] = [];
  let visible = initiallyVisible;
  return {
    calls,
    target: {
      isMinimized: () => minimized,
      isVisible: () => visible,
      restore: () => {
        visible = true;
        calls.push("restore");
      },
      show: () => {
        visible = true;
        calls.push("show");
      },
      focus: () => calls.push("focus"),
      webContents: { focus: () => calls.push("webContents.focus") },
    },
  };
}

test("dictation preserves a visible window's maximized or fullscreen state", () => {
  const window = createWindow(false);
  focusWindowForDictation(window.target);
  assert.deepEqual(window.calls, ["focus", "webContents.focus"]);
});

test("dictation restores a minimized window before focusing it", () => {
  const window = createWindow(true);
  focusWindowForDictation(window.target);
  assert.deepEqual(window.calls, ["restore", "focus", "webContents.focus"]);
});

test("dictation shows a hidden window before focusing it", () => {
  const window = createWindow(false, false);
  focusWindowForDictation(window.target);
  assert.deepEqual(window.calls, ["show", "focus", "webContents.focus"]);
});
