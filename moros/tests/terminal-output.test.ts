import assert from "node:assert/strict";
import test from "node:test";
import { TerminalOutput } from "../src/renderer/src/workbench/terminal-output.ts";
import type { WorkbenchTerminal } from "../src/shared/workbench.ts";

function snapshot(output: string, baseOffset = 0, pendingCursorResponse = false): WorkbenchTerminal {
  return { id: "one", title: "Terminal", cwd: "/workspace", shell: "test", status: "running", commands: [],
    output, baseOffset, endOffset: baseOffset + output.length, pendingCursorResponse };
}

test("a delayed snapshot cannot rewind output after overlapping live chunks", async () => {
  let rendered = "";
  let delayed!: (value: WorkbenchTerminal) => void;
  let reads = 0;
  const stream = new TerminalOutput({
    read: async () => ++reads === 1 ? snapshot("") : new Promise((done) => { delayed = done; }),
    write: async (data) => { rendered += data; }, input: async () => {}, snapshot() {}, trimmed: () => "[trimmed]",
  });
  await stream.sync();
  const pending = stream.sync();
  await stream.accept([{ offset: 0, data: "ABCDEFGHIJ" }]);
  delayed(snapshot("ABCDE"));
  await pending;
  await stream.accept([{ offset: 5, data: "FGHIJ" }]);
  assert.equal(rendered, "ABCDEFGHIJ");
});

test("the cursor is reserved before xterm's asynchronous write callback", async () => {
  let rendered = "", release!: () => void, writes = 0;
  const stream = new TerminalOutput({ read: async () => snapshot("ABCDE"),
    write: async (data) => { rendered += data; if (++writes === 2) await new Promise<void>((done) => { release = done; }); },
    input: async () => {}, snapshot() {}, trimmed: () => "[trimmed]" });
  await stream.sync();
  const pending = stream.accept([{ offset: 5, data: "FGHIJ" }]);
  await stream.sync();
  await stream.accept([{ offset: 5, data: "FGHIJ" }]);
  release(); await pending;
  assert.equal(rendered, "ABCDEFGHIJ");
});

test("initial replay buffers chunks, reports trimming and answers only a pending VT query", async () => {
  let read!: (value: WorkbenchTerminal) => void;
  let rendered = "";
  const inputs: string[] = [];
  const response = "\x1b[1;1R";
  const stream = new TerminalOutput({
    read: () => new Promise((done) => { read = done; }),
    write: async (data) => { rendered += data; if (data.includes("\x1b[6n")) await stream.input(response); },
    input: async (data) => { inputs.push(data); }, snapshot() {}, trimmed: () => "[trimmed]",
  });
  const pending = stream.sync();
  await stream.accept([{ offset: 10, data: "live" }]);
  read(snapshot("A\x1b[6n", 5, true));
  await pending;
  assert.equal(rendered, "[trimmed]A\x1b[6nlive");
  assert.deepEqual(inputs, [response]);
  await stream.input("user\r"); assert.equal(inputs.at(-1), "user\r");
  stream.dispose();
  await stream.accept([{ offset: 14, data: "ignored" }]);
  assert.equal(rendered.endsWith("live"), true);
});

test("a disposed viewer ignores an in-flight snapshot", async () => {
  let read!: (value: WorkbenchTerminal) => void;
  const stream = new TerminalOutput({ read: () => new Promise((done) => { read = done; }),
    write: async () => { assert.fail("disposed viewer received output"); }, input: async () => {}, snapshot() { assert.fail("disposed viewer received state"); }, trimmed: () => "" });
  const pending = stream.sync(); stream.dispose(); read(snapshot("old session")); await pending;
});
