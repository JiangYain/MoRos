import assert from "node:assert/strict";
import test from "node:test";
import {
  pickFocusRestoreTarget,
  type EditorCloseReason,
  type FocusRestoreTargets,
} from "../src/renderer/src/components/provider-focus.ts";

function makeTargets(): { trigger: HTMLElement; input: HTMLElement; targets: FocusRestoreTargets } {
  // Lightweight stand-ins for HTMLElement so the test stays DOM-free.
  const trigger = { kind: "trigger" } as unknown as HTMLElement;
  const input = { kind: "input" } as unknown as HTMLElement;
  return { trigger, input, targets: { triggerButton: trigger, editorInput: input } };
}

test("explicit close reasons restore focus to the trigger button", () => {
  const reasons: EditorCloseReason[] = ["save", "cancel", "escape"];
  for (const reason of reasons) {
    const { trigger, targets } = makeTargets();
    assert.equal(pickFocusRestoreTarget(reason, targets), trigger);
  }
});

test("blur also restores to the trigger when available", () => {
  const { trigger, targets } = makeTargets();
  assert.equal(pickFocusRestoreTarget("blur", targets), trigger);
});

test("falls back to the editor input when the trigger button is gone", () => {
  const { input } = makeTargets();
  const targets: FocusRestoreTargets = { triggerButton: null, editorInput: input };
  assert.equal(pickFocusRestoreTarget("save", targets), input);
  assert.equal(pickFocusRestoreTarget("escape", targets), input);
});

test("returns null only when both anchors are missing", () => {
  const targets: FocusRestoreTargets = { triggerButton: null, editorInput: null };
  assert.equal(pickFocusRestoreTarget("save", targets), null);
});
