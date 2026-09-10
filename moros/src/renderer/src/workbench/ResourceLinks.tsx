import { File, Globe, SquareTerminal, GitCompareArrows } from "lucide-react";
import { findWorkbenchLinks, parseWorkbenchLink } from "../../../shared/workbench-links";
import { useMoros } from "../store";
import type { ReactNode } from "react";

export function ResourceText({ text }: { text: string }): React.JSX.Element {
  const open = useMoros((state) => state.openWorkbench);
  const parts: ReactNode[] = [];
  let offset = 0;
  for (const match of findWorkbenchLinks(text)) {
    parts.push(text.slice(offset, match.start));
    parts.push(<button type="button" className="workbench-resource-link" key={match.start} onClick={() => void open(match.resource)}>{match.label}</button>);
    offset = match.end;
  }
  parts.push(text.slice(offset));
  return <>{parts}</>;
}

export function ToolResourceLinks({ args, output }: { args: unknown; output?: string }): React.JSX.Element | null {
  const open = useMoros((state) => state.openWorkbench);
  const values = args && typeof args === "object" ? Object.values(args).filter((value): value is string => typeof value === "string") : [];
  const resources = values.flatMap((value) => { const direct = parseWorkbenchLink(value); return direct ? [{ resource: direct, label: value }] : findWorkbenchLinks(value); });
  resources.push(...findWorkbenchLinks((output ?? "").slice(0, 6000)));
  const unique = [...new Map(resources.map((item) => [JSON.stringify(item.resource), item])).values()].slice(0, 6);
  if (!unique.length) return null;
  const icons = { files: File, file: File, browser: Globe, terminal: SquareTerminal, review: GitCompareArrows };
  return <div className="wb-tool-resources">{unique.map(({ resource, label }) => { const Icon = icons[resource.kind]; return <button key={JSON.stringify(resource)} title={label} onClick={() => void open(resource)}><Icon size={12} />{resource.kind === "file" ? resource.path.split(/[\\/]/).at(-1) : label}</button>; })}</div>;
}
