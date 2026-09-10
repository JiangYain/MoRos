import type { WorkbenchResource } from "./workbench.ts";

const FILE_EXTENSIONS = /\.(?:tsx?|jsx?|mjs|cjs|py|r|rs|go|java|c|h|cpp|cs|jsonc?|ya?ml|toml|ini|xml|html?|css|scss|sql|sh|ps1|bat|mdx?|markdown|txt|log|csv|tsv|png|jpe?g|gif|webp|svg|avif|pdf|docx?|xlsx?|pptx?)(?::\d+(?::\d+)?)?(?:#L\d+)?$/i;

export function parseWorkbenchLink(value: string): WorkbenchResource | undefined {
  let input = value.trim().replace(/^<|>$/g, "");
  if (input.startsWith("#moros-file=")) {
    try { input = decodeURIComponent(input.slice("#moros-file=".length)); } catch { return undefined; }
  }
  if (/^https?:\/\//i.test(input)) return { kind: "browser", url: input };
  if (/^terminal:\/\//.test(input)) return { kind: "terminal", terminalId: input.slice("terminal://".length) };
  if (input.startsWith("moros://review")) {
    try {
      const url = new URL(input);
      const range = url.searchParams.get("range") ?? "unstaged";
      if (!["unstaged", "staged", "branch", "commit", "last-turn"].includes(range)) return undefined;
      return { kind: "review", range: range as Extract<WorkbenchResource, { kind: "review" }>["range"], ref: url.searchParams.get("ref") ?? undefined, path: url.searchParams.get("path") ?? undefined };
    } catch { return undefined; }
  }
  if (input.startsWith("file://")) {
    try { const url = new URL(input); input = decodeURIComponent(url.pathname).replace(/^\/([A-Za-z]:\/)/, "$1"); }
    catch { return undefined; }
  }
  if (!FILE_EXTENSIONS.test(input) || /[\r\n]/.test(input)) return undefined;
  const suffix = /(?::(\d+)(?::\d+)?|#L(\d+))$/.exec(input);
  const path = suffix ? input.slice(0, suffix.index) : input;
  if (/^[a-z][a-z\d+.-]*:/i.test(path) && !/^[a-z]:[\\/]/i.test(path)) return undefined;
  return { kind: "file", path, ...(suffix ? { line: Number(suffix[1] ?? suffix[2]) } : {}) };
}

export function relativeWorkbenchResource(resource: WorkbenchResource | undefined, sourcePath?: string): WorkbenchResource | undefined {
  if (resource?.kind !== "file" || !sourcePath || /^(?:[a-z]:[\\/]|[\\/])/i.test(resource.path)) return resource;
  return { ...resource, path: `${sourcePath.replace(/[\\/][^\\/]*$/, "")}/${resource.path}` };
}

/** Use an ordinary fragment through Markdown sanitization; clicks stay inside Moros. */
export function prepareWorkbenchMarkdown(text: string): string {
  return text.replace(/(!?\[[^\]\n]*\]\()(<[^>\n]+>|[^)\n]+)(\))/g, (whole, before: string, target: string, after: string) => {
    const resource = parseWorkbenchLink(target);
    return resource?.kind === "file" ? `${before}#moros-file=${encodeURIComponent(target.replace(/^<|>$/g, ""))}${after}` : whole;
  });
}

export function findWorkbenchLinks(text: string): Array<{ start: number; end: number; resource: WorkbenchResource; label: string }> {
  const result: Array<{ start: number; end: number; resource: WorkbenchResource; label: string }> = [];
  const pattern = /https?:\/\/[^\s<>"'\])，。；]+|terminal:\/\/[^\s<>"']+|moros:\/\/review[^\s<>"']*|(?:[A-Za-z]:[\\/]|\.{0,2}\/)[^\s<>"'，。；]+\.[A-Za-z0-9]+(?::\d+(?::\d+)?)?(?:#L\d+)?/g;
  for (const match of text.matchAll(pattern)) {
    const label = match[0].replace(/[),.;]+$/, "");
    const resource = parseWorkbenchLink(label);
    if (resource) result.push({ start: match.index, end: match.index + label.length, resource, label });
  }
  return result;
}
