import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { WorkbenchScope, WorkbenchTab, WorkbenchTerminal } from "../../../shared/workbench";
import { useMoros } from "../store";
import { useWorkbenchText } from "./useWorkbench";
import { TerminalOutput } from "./terminal-output";

function terminalTheme() {
  const style = getComputedStyle(document.documentElement);
  return {
    background: style.getPropertyValue("--color-bg").trim(), foreground: style.getPropertyValue("--color-text-primary").trim(), cursor: style.getPropertyValue("--color-accent").trim(),
    ...(document.documentElement.dataset.theme === "dark" ? {} : {
      black: "#20272d", brightBlack: "#687680", white: "#4c5962", brightWhite: "#20272d",
      red: "#c74436", brightRed: "#d34835", green: "#41794f", brightGreen: "#3f8051",
      yellow: "#887019", brightYellow: "#94720f", blue: "#3775aa", brightBlue: "#397eae",
      magenta: "#846196", brightMagenta: "#9171a9", cyan: "#267782", brightCyan: "#37818c",
    }),
  };
}

export function TerminalPane({ scope, tab, active }: { scope: WorkbenchScope; tab: WorkbenchTab; active: boolean }): React.JSX.Element {
  const { wt, errorText } = useWorkbenchText();
  const call = useMoros((state) => state.workbenchCall);
  const chunks = useMoros((state) => state.workbenchTerminalChunks?.[tab.id]);
  const status = useMoros((state) => state.workbenchTerminalStatus?.[tab.id]);
  const host = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | undefined>(undefined);
  const fit = useRef<FitAddon | undefined>(undefined);
  const output = useRef<TerminalOutput | undefined>(undefined);
  const [metadata, setMetadata] = useState<WorkbenchTerminal>();
  const [error, setError] = useState("");
  const fail = (error: unknown): void => setError(errorText(error));
  const sync = async (): Promise<void> => {
    try {
      await output.current?.sync();
      setError("");
    } catch (error) { fail(error); }
  };
  const resize = (): void => {
    if (!host.current?.clientWidth || !terminal.current || !fit.current) return;
    fit.current.fit();
    void call({ scope, operation: "terminal", tabId: tab.id, action: "resize", cols: terminal.current.cols, rows: terminal.current.rows }).catch(fail);
  };
  useEffect(() => {
    if (!host.current) return;
    const style = getComputedStyle(document.documentElement);
    const value = new Terminal({ cursorBlink: true, fontFamily: style.getPropertyValue("--font-mono"), fontSize: 12, scrollback: 10000, theme: terminalTheme() });
    const addon = new FitAddon(); value.loadAddon(addon); value.open(host.current);
    value.textarea?.setAttribute("aria-label", wt("terminalInput"));
    value.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown" || !event.ctrlKey || !event.shiftKey || !["c", "v"].includes(event.key.toLowerCase())) return true;
      event.preventDefault();
      if (event.key.toLowerCase() === "c") void navigator.clipboard.writeText(value.getSelection()).catch(fail);
      else void navigator.clipboard.readText().then((text) => value.paste(text)).catch(fail);
      return false;
    });
    terminal.current = value; fit.current = addon;
    const stream = new TerminalOutput({
      read: async (offset) => (await call({ scope, operation: "terminal", tabId: tab.id, action: "read", offset })).terminal!,
      write: (data) => new Promise<void>((resolve) => value.write(data, resolve)),
      input: (data) => call({ scope, operation: "terminal", tabId: tab.id, action: "input", data }),
      snapshot: setMetadata,
      trimmed: () => `\r\n[${wt("outputTrimmed")}]\r\n`,
    });
    output.current = stream;
    const input = value.onData((data) => { void stream.input(data).catch(fail); });
    const observer = new ResizeObserver(resize); observer.observe(host.current);
    const themeObserver = new MutationObserver(() => { value.options.theme = terminalTheme(); });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    void sync();
    return () => { stream.dispose(); observer.disconnect(); themeObserver.disconnect(); input.dispose(); value.dispose(); terminal.current = undefined; fit.current = undefined; output.current = undefined; };
  }, [tab.id, scope.workspaceDir, scope.sessionId]);
  useEffect(() => { if (active) { resize(); void sync(); } }, [active]);
  useEffect(() => {
    void output.current?.accept(chunks ?? []).catch(fail);
  }, [chunks]);
  return <section className="wb-terminal-pane" aria-label={tab.title}>
    {error && <div className="wb-error" role="alert">{error}<button onClick={() => void sync()}>{wt("retry")}</button></div>}
    <div className="wb-terminal-host" ref={host} />
    <div className="wb-terminal-source">{(status?.source ?? metadata?.commands.at(-1)?.source) === "agent" ? wt("agent") : wt("user")}</div>
  </section>;
}
