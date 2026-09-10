import type { UiSkill } from "@shared/types";
import { useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { editorSelection, editorText, selectEditorRange } from "./composer-editor-dom";
import { findInlineSkills } from "./inline-skills";

export interface ComposerEditorHandle {
  focus(): void;
  readonly value: string;
  setSelectionRange(start: number, end: number): void;
  insertSkill(start: number, end: number, skill: UiSkill): void;
}

interface ComposerEditorProps {
  ref: React.Ref<ComposerEditorHandle>;
  value: string;
  skills: UiSkill[];
  placeholder: string;
  onChange(value: string): void;
  onCaretChange(caret: number | null): void;
  onFocus(): void;
  onBlur(): void;
  onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void;
  onPaste(event: React.ClipboardEvent<HTMLDivElement>): void;
}

export function ComposerEditor(props: ComposerEditorProps): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const callbacks = useRef(props);
  callbacks.current = props;

  const chip = (skill: UiSkill): HTMLElement => {
    const node = document.createElement("span");
    node.className = "composer-skill-chip";
    node.contentEditable = "false";
    node.dataset.skillCommand = `/skill:${skill.name}`;
    const icon = (paths: string[], size: number, strokeWidth: number): SVGSVGElement => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      for (const [name, value] of Object.entries({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": strokeWidth, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) {
        svg.setAttribute(name, String(value));
      }
      for (const d of paths) {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        svg.append(path);
      }
      return svg;
    };
    const label = document.createElement("span");
    label.textContent = skill.name.charAt(0).toUpperCase() + skill.name.slice(1);
    node.append(icon([
      "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z",
      "m3.3 7 8.7 5 8.7-5", "M12 22V12",
    ], 16, 1.75), label);
    return node;
  };
  const reportSelection = (): void => {
    const root = rootRef.current;
    if (!root || composing.current) return;
    const selection = editorSelection(root);
    if (selection) callbacks.current.onCaretChange(selection.start === selection.end ? selection.start : null);
  };
  const reportInput = (): void => {
    if (composing.current || !rootRef.current) return;
    callbacks.current.onChange(editorText(rootRef.current));
    reportSelection();
  };
  const replace = (start: number, end: number, html: string): void => {
    const root = rootRef.current;
    if (!root) return;
    root.focus();
    selectEditorRange(root, start, end);
    // Native editing keeps label insertion/removal in the browser's undo history.
    document.execCommand(html ? "insertHTML" : "delete", false, html);
    reportInput();
  };

  useImperativeHandle(props.ref, () => ({
    focus: () => rootRef.current?.focus(),
    get value() { return rootRef.current ? editorText(rootRef.current) : ""; },
    setSelectionRange: (start, end) => { if (rootRef.current) selectEditorRange(rootRef.current, start, end); },
    insertSkill: (start, end, skill) => replace(start, end, `${chip(skill).outerHTML} `),
  }));

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || composing.current) return;
    for (const token of root.querySelectorAll<HTMLElement>(".composer-skill-chip")) {
      const skill = props.skills.find((skill) => token.dataset.skillCommand === `/skill:${skill.name}`);
      if (!skill) continue;
      const updated = chip(skill);
      if (token.innerHTML !== updated.innerHTML) token.replaceChildren(...updated.childNodes);
    }
    if (editorText(root) === props.value) {
      if (!props.value && root.childNodes.length) root.replaceChildren();
      return;
    }
    const selection = document.activeElement === root ? editorSelection(root) : null;
    const nodes: Node[] = [];
    let offset = 0;
    for (const match of findInlineSkills(props.value, props.skills)) {
      nodes.push(document.createTextNode(props.value.slice(offset, match.start)), chip(match.skill));
      offset = match.end;
    }
    nodes.push(document.createTextNode(props.value.slice(offset)));
    root.replaceChildren(...nodes);
    if (selection) selectEditorRange(root, Math.min(selection.start, props.value.length), Math.min(selection.end, props.value.length));
  });

  useEffect(() => {
    document.addEventListener("selectionchange", reportSelection);
    return () => document.removeEventListener("selectionchange", reportSelection);
  }, []);

  return <div
    ref={rootRef}
    className="composer-editor"
    contentEditable
    suppressContentEditableWarning
    role="textbox"
    aria-multiline="true"
    aria-label={props.placeholder}
    data-placeholder={props.placeholder}
    data-value={props.value}
    spellCheck={false}
    onInput={reportInput}
    onFocus={() => { props.onFocus(); reportSelection(); }}
    onBlur={props.onBlur}
    onCompositionStart={() => { composing.current = true; }}
    onCompositionEnd={() => { composing.current = false; reportInput(); }}
    onKeyDown={(event) => {
      props.onKeyDown(event);
      if (event.defaultPrevented || event.nativeEvent.isComposing) return;
      if (event.key === "Enter") {
        event.preventDefault();
        document.execCommand("insertText", false, "\n");
      } else if (event.key === "Backspace" || event.key === "Delete") {
        const selection = editorSelection(event.currentTarget);
        if (!selection || selection.start !== selection.end) return;
        const match = findInlineSkills(editorText(event.currentTarget), props.skills).find((match) => (
          event.key === "Backspace" ? match.end === selection.start : match.start === selection.start
        ));
        if (match) { event.preventDefault(); replace(match.start, match.end, ""); }
      }
    }}
    onPaste={(event) => {
      props.onPaste(event);
      if (event.defaultPrevented) return;
      event.preventDefault();
      document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
    }}
    onCopy={(event) => {
      const selection = editorSelection(event.currentTarget);
      if (!selection) return;
      event.preventDefault();
      event.clipboardData.setData("text/plain", editorText(event.currentTarget).slice(selection.start, selection.end));
    }}
    onCut={(event) => {
      const selection = editorSelection(event.currentTarget);
      if (!selection) return;
      event.preventDefault();
      event.clipboardData.setData("text/plain", editorText(event.currentTarget).slice(selection.start, selection.end));
      replace(selection.start, selection.end, "");
    }}
  />;
}
