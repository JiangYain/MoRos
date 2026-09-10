import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, File, FilePlus2, Folder, FolderPlus, RefreshCw } from "lucide-react";
import type { WorkbenchDirectory, WorkbenchScope } from "../../../shared/workbench";
import { useMoros } from "../store";
import { useWorkbenchText } from "./useWorkbench";

export function FileTree({ scope, selected, rootPath, onCreate }: { scope: WorkbenchScope; selected?: string; rootPath?: string; onCreate?(directory: boolean): void }): React.JSX.Element {
  const { wt, errorText } = useWorkbenchText();
  const call = useMoros((state) => state.workbenchCall);
  const open = useMoros((state) => state.openWorkbench);
  const treeRoot = rootPath ?? scope.workspaceDir;
  const [directories, setDirectories] = useState<Record<string, WorkbenchDirectory>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set([treeRoot]));
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const load = async (path: string): Promise<void> => {
    try {
      const result = await call({ scope, operation: "directory", path });
      if (result.directory) setDirectories((current) => ({ ...current, [path]: result.directory! }));
      setError("");
    } catch (error) { setError(errorText(error)); }
  };
  useEffect(() => { void load(treeRoot); setExpanded((current) => new Set([...current, treeRoot])); }, [treeRoot, scope.sessionId]);
  const rows = (path: string, depth: number): React.ReactNode => directories[path]?.entries.filter((entry) => entry.directory || entry.name.toLowerCase().includes(filter.toLowerCase())).map((entry) => <div key={entry.path}>
    <button style={{ paddingLeft: 8 + depth * 13 }} aria-current={entry.path === selected ? "true" : undefined} aria-expanded={entry.directory ? expanded.has(entry.path) : undefined} title={entry.name} onClick={() => {
      if (!entry.directory) { void open({ kind: "file", path: entry.path }); return; }
      setExpanded((current) => { const next = new Set(current); if (next.has(entry.path)) next.delete(entry.path); else next.add(entry.path); return next; });
      if (!directories[entry.path]) void load(entry.path);
    }}>{entry.directory ? expanded.has(entry.path) ? <ChevronDown size={12} /> : <ChevronRight size={12} /> : <span className="wb-tree-indent" />}{entry.directory ? <Folder size={12} /> : <File size={12} />}<span>{entry.name}</span></button>
    {entry.directory && expanded.has(entry.path) && rows(entry.path, depth + 1)}
  </div>);
  return <aside className="wb-file-tree" aria-label={wt("fileTree")}>
    <header className="wb-tree-header"><span title={treeRoot}>{treeRoot.split(/[\\/]/).filter(Boolean).at(-1)}</span>{onCreate && <><button aria-label={wt("newFile")} title={wt("newFile")} onClick={() => onCreate(false)}><FilePlus2 size={13} /></button><button aria-label={wt("newFolder")} title={wt("newFolder")} onClick={() => onCreate(true)}><FolderPlus size={13} /></button></>}<button aria-label={wt("refresh")} onClick={() => { for (const path of expanded) void load(path); }}><RefreshCw size={12} /></button></header>
    {!onCreate && <div className="wb-tree-filter"><input aria-label={wt("filterFiles")} placeholder={wt("filterFiles")} value={filter} onChange={(event) => setFilter(event.target.value)} /></div>}
    {error && <p className="wb-error" role="alert">{error}</p>}
    <nav aria-label={wt("files")}>{rows(treeRoot, 0)}</nav>
    {Object.values(directories).some((directory) => directory.truncated) && <small>{wt("directoryLimit")}</small>}
  </aside>;
}
