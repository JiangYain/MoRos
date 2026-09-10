import { File, GitCompareArrows, Globe, SquareTerminal } from "lucide-react";
import { useMoros } from "../store";
import { useWorkbenchText } from "./useWorkbench";

export function WorkbenchStart({ menu = false, done }: { menu?: boolean; done?(): void }): React.JSX.Element {
  const { wt } = useWorkbenchText();
  const open = useMoros((state) => state.openWorkbench);
  const entries = [
    { title: wt("review"), Icon: GitCompareArrows, shortcut: "Ctrl+Shift+G", run: () => void open({ kind: "review", range: "unstaged" }) },
    { title: wt("terminal"), Icon: SquareTerminal, shortcut: "Ctrl+`", run: () => void open({ kind: "terminal" }) },
    { title: wt("browser"), Icon: Globe, shortcut: "Ctrl+T", run: () => void open({ kind: "browser", url: "" }) },
    { title: wt("files"), Icon: File, shortcut: "Ctrl+Shift+P", run: () => void open({ kind: "files" }) },
  ];
  return <div className={menu ? "wb-add-menu" : "wb-start"} aria-label={wt("addTab")}>
    {entries.map(({ title, Icon, shortcut, run }) => <button key={title} onClick={() => { done?.(); run(); }}><Icon size={14} /><span>{title}</span><kbd>{shortcut}</kbd></button>)}
  </div>;
}
