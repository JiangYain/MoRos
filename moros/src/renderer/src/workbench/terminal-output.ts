import type { WorkbenchTerminal } from "../../../shared/workbench.ts";

type Chunk = { offset: number; data: string };
interface OutputPort {
  read(offset: number): Promise<WorkbenchTerminal>;
  write(data: string): Promise<void>;
  input(data: string): Promise<unknown>;
  snapshot(value: WorkbenchTerminal): void;
  trimmed(): string;
}

/** One monotonic cursor consumes both retained snapshots and live SSE/IPC chunks. */
export class TerminalOutput {
  private offset = 0;
  private phase: "initial" | "replay" | "live" | "disposed" = "initial";
  private chunks: readonly Chunk[] = [];
  private pending?: Promise<void>;
  private cursorResponse?: string;
  private readonly port: OutputPort;
  constructor(port: OutputPort) { this.port = port; }

  private consume(chunk: Chunk, allowGap = false): string {
    const end = chunk.offset + chunk.data.length;
    if (end <= this.offset) return "";
    if (chunk.offset > this.offset && !allowGap) return "";
    const prefix = chunk.offset > this.offset ? this.port.trimmed() : "";
    const text = chunk.data.slice(Math.max(0, this.offset - chunk.offset));
    // Reserve bytes before asynchronous rendering; a late snapshot cannot replay them.
    this.offset = end;
    return prefix + text;
  }

  async accept(chunks: readonly Chunk[]): Promise<void> {
    this.chunks = chunks;
    if (this.phase !== "live") return;
    for (const chunk of chunks) {
      if (chunk.offset > this.offset) { await this.sync(); return; }
      const text = this.consume(chunk);
      if (text) await this.port.write(text);
      if (this.phase !== "live") return;
    }
  }

  async input(data: string): Promise<void> {
    if (this.phase === "live") await this.port.input(data);
    else if (this.phase === "replay" && /^\x1b\[\??\d+;\d+R$/.test(data)) this.cursorResponse = data;
  }

  sync(): Promise<void> {
    if (this.phase === "disposed") return Promise.resolve();
    if (this.pending) return this.pending;
    const task = this.readSnapshot();
    this.pending = task;
    return task.finally(() => { if (this.pending === task) this.pending = undefined; });
  }

  private async readSnapshot(): Promise<void> {
    const data = await this.port.read(this.offset);
    if (this.disposed) return;
    const initial = this.phase === "initial";
    if (initial) { this.phase = "replay"; this.cursorResponse = undefined; }
    this.port.snapshot(data);
    try {
      const text = this.consume({ offset: data.baseOffset, data: data.output }, true);
      if (text) await this.port.write(text);
      if (this.disposed) return;
      if (initial && data.pendingCursorResponse && this.cursorResponse) await this.port.input(this.cursorResponse);
    } finally {
      if (!this.disposed) this.phase = "live";
    }
    // Only contiguous buffered data belongs after this snapshot. A future chunk
    // or focus refresh recovers any remaining gap without recursive sync waits.
    for (const chunk of this.chunks) {
      if (this.disposed || chunk.offset > this.offset) break;
      const text = this.consume(chunk);
      if (text) await this.port.write(text);
    }
  }

  private get disposed(): boolean { return this.phase === "disposed"; }
  dispose(): void { this.phase = "disposed"; this.chunks = []; }
}
