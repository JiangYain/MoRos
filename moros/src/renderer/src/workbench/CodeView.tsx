import { useEffect, useImperativeHandle, useRef } from "react";
import { basicSetup, EditorView } from "codemirror";
import { EditorState, StateEffect } from "@codemirror/state";
import { languages } from "@codemirror/language-data";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

export interface CodeViewHandle { selection(): { line: number; endLine: number; text: string } }
const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--color-accent)" },
  { tag: [tags.string, tags.regexp], color: "#54875e" },
  { tag: [tags.number, tags.bool], color: "#9876aa" },
  { tag: tags.comment, color: "var(--color-text-tertiary)", fontStyle: "italic" },
  { tag: [tags.typeName, tags.className], color: "#538eb4" },
]);

export function CodeView({ text, path, line, wrap, ref }: { text: string; path: string; line?: number; wrap: boolean; ref?: React.Ref<CodeViewHandle> }): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const saved = useRef({ anchor: 0, scrollTop: 0 });
  useImperativeHandle(ref, () => ({ selection: () => {
    const view = editor.current;
    if (!view) return { line: line ?? 1, endLine: line ?? 1, text: "" };
    const selected = view.state.selection.main;
    const from = view.state.doc.lineAt(selected.from);
    const to = view.state.doc.lineAt(selected.to);
    return { line: from.number, endLine: to.number, text: selected.empty ? from.text : view.state.sliceDoc(selected.from, selected.to).slice(0, 4000) };
  } }));
  useEffect(() => {
    if (!root.current) return;
    const view = new EditorView({ parent: root.current, state: EditorState.create({ doc: text, extensions: [
      basicSetup, EditorState.readOnly.of(true), EditorView.editable.of(false), syntaxHighlighting(highlight),
      ...(wrap ? [EditorView.lineWrapping] : []),
      EditorView.theme({
        "&": { height: "100%", backgroundColor: "var(--color-bg)", color: "var(--color-text-primary)", fontSize: "12px" },
        ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.65", overflow: "auto" },
        ".cm-content": { padding: "12px 0" },
        ".cm-gutters": { border: "none", backgroundColor: "var(--color-bg)", color: "var(--color-text-tertiary)" },
        ".cm-activeLineGutter, .cm-activeLine": { backgroundColor: "var(--color-surface)" },
        "&.cm-focused": { outline: "none" },
        ".cm-selectionBackground": { backgroundColor: "var(--color-surface-hover) !important" },
      }),
      EditorView.contentAttributes.of({ "aria-label": path }),
    ] }) });
    editor.current = view;
    view.dispatch({ selection: { anchor: Math.min(saved.current.anchor, text.length) } });
    view.scrollDOM.scrollTop = saved.current.scrollTop;
    const extension = path.split(".").at(-1)?.toLowerCase();
    const description = languages.find((language) => language.extensions.includes(extension ?? ""));
    let disposed = false;
    if (description && text.length < 600_000) void description.load().then((support) => { if (!disposed) view.dispatch({ effects: StateEffect.appendConfig.of(support) }); });
    return () => {
      disposed = true;
      saved.current = { anchor: view.state.selection.main.anchor, scrollTop: view.scrollDOM.scrollTop };
      editor.current = null;
      view.destroy();
    };
  }, [text, path, wrap]);
  useEffect(() => {
    const view = editor.current;
    if (!view || !line) return;
    const target = view.state.doc.line(Math.max(1, Math.min(line, view.state.doc.lines))).from;
    view.dispatch({ selection: { anchor: target }, effects: EditorView.scrollIntoView(target, { y: "center" }) });
  }, [line, text, path, wrap]);
  return <div className="wb-code" ref={root} />;
}
