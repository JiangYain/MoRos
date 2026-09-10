import * as pty from "node-pty";
import type { WorkbenchEvent, WorkbenchScope, WorkbenchTerminal } from "../../shared/workbench.ts";
import { workbenchScopeKey } from "../../shared/workbench.ts";

const OUTPUT_LIMIT = 1_000_000;
interface TerminalRecord {
  scope: WorkbenchScope; process: pty.IPty; metadata: WorkbenchTerminal;
  pending: string; timer?: ReturnType<typeof setTimeout>;
  queryTail?: string;
}

export class WorkbenchTerminals {
  private readonly terminals = new Map<string, TerminalRecord>();
  private readonly emit: (event: WorkbenchEvent) => void;
  constructor(emit: (event: WorkbenchEvent) => void) { this.emit = emit; }

  create(scope: WorkbenchScope, id: string, cwd: string, title: string): WorkbenchTerminal {
    const shell = process.platform === "win32" ? "powershell.exe" : process.env.SHELL || "/bin/bash";
    const env: Record<string, string | undefined> = { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" };
    delete env.ELECTRON_RUN_AS_NODE;
    const terminal = pty.spawn(shell, process.platform === "win32" ? ["-NoLogo", "-NoProfile"] : ["-l"], { name: "xterm-256color", cols: 80, rows: 24, cwd, env });
    const metadata: WorkbenchTerminal = { id, title, cwd, shell, status: "running", pid: terminal.pid, baseOffset: 0, endOffset: 0, output: "", commands: [] };
    const record: TerminalRecord = { scope, process: terminal, metadata, pending: "" };
    this.terminals.set(id, record);
    terminal.onData((data) => {
      const queryData = (record.queryTail ?? "") + data;
      if (/\x1b\[\??6n/.test(queryData)) metadata.pendingCursorResponse = true;
      const tail = queryData.slice(queryData.lastIndexOf("\x1b"));
      record.queryTail = /^\x1b(?:\[(?:\??6?)?)?$/.test(tail) ? tail : "";
      metadata.output += data;
      metadata.endOffset += data.length;
      if (metadata.output.length > OUTPUT_LIMIT) {
        const removed = metadata.output.length - OUTPUT_LIMIT;
        metadata.output = metadata.output.slice(removed);
        metadata.baseOffset += removed;
      }
      record.pending += data;
      record.timer ??= setTimeout(() => this.flush(record), 25);
    });
    terminal.onExit(({ exitCode }) => {
      this.flush(record);
      metadata.status = "exited";
      metadata.exitCode = exitCode;
      this.emit({ kind: "workbench", scope, type: "terminal-status", tabId: id, status: "exited", exitCode });
    });
    return { ...metadata, commands: [] };
  }

  private flush(record: TerminalRecord): void {
    if (record.timer) clearTimeout(record.timer);
    record.timer = undefined;
    if (!record.pending) return;
    const data = record.pending;
    record.pending = "";
    this.emit({ kind: "workbench", scope: record.scope, type: "terminal-data", tabId: record.metadata.id, data, offset: record.metadata.endOffset - data.length });
  }

  private get(scope: WorkbenchScope, id: string): TerminalRecord {
    const record = this.terminals.get(id);
    if (!record) throw new Error("WB_TERMINAL_GONE");
    if (workbenchScopeKey(record.scope) !== workbenchScopeKey(scope)) throw new Error("WB_SCOPE_MISMATCH");
    return record;
  }
  read(scope: WorkbenchScope, id: string, offset = 0): WorkbenchTerminal {
    const { metadata } = this.get(scope, id);
    const start = Math.max(metadata.baseOffset, Math.min(metadata.endOffset, offset));
    return { ...metadata, baseOffset: start, output: metadata.output.slice(start - metadata.baseOffset), commands: [...metadata.commands] };
  }
  input(scope: WorkbenchScope, id: string, data: string, source: "user" | "agent"): void {
    const record = this.get(scope, id);
    if (record.metadata.status !== "running") throw new Error("WB_TERMINAL_EXITED");
    if (/^\x1b\[\??\d+;\d+R$/.test(data)) {
      // Multiple viewers and history replay can answer the same VT query.
      // Forward only the answer that still belongs to a live shell request.
      if (!record.metadata.pendingCursorResponse) return;
      record.metadata.pendingCursorResponse = false;
    }
    // Actor identity comes from the trusted caller, never from the RPC payload.
    if (source === "agent" || /[\r\n]/.test(data)) {
      record.metadata.commands.push({ source, text: source === "agent" ? data : "Interactive user input", at: Date.now() });
      record.metadata.commands = record.metadata.commands.slice(-100);
      this.emit({ kind: "workbench", scope, type: "terminal-status", tabId: id, status: record.metadata.status, source });
    }
    record.process.write(data);
  }
  resize(scope: WorkbenchScope, id: string, cols: number, rows: number): void {
    const record = this.get(scope, id);
    if (record.metadata.status === "running") record.process.resize(cols, rows);
  }
  isRunning(scope: WorkbenchScope, id: string): boolean { return this.terminals.has(id) && this.get(scope, id).metadata.status === "running"; }
  close(scope: WorkbenchScope, id: string): void {
    if (!this.terminals.has(id)) return;
    const record = this.get(scope, id);
    this.flush(record);
    if (record.metadata.status === "running") record.process.kill();
    this.terminals.delete(id);
  }
  closeAll(): void { for (const [id, record] of this.terminals) this.close(record.scope, id); }
}
