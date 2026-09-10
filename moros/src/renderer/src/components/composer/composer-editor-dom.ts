type DomPoint = [Node, number];
interface EditorSegment { text: string; start: DomPoint; end: DomPoint; textNode?: Text }

function editorSegments(root: Node): EditorSegment[] {
  const segments: EditorSegment[] = [];
  const block = (node: Node): node is HTMLElement => node instanceof HTMLElement && /^(DIV|P)$/.test(node.tagName);
  const walk = (parent: Node): void => {
    const children = Array.from(parent.childNodes);
    children.forEach((child, index) => {
      const before: DomPoint = [parent, index];
      const after: DomPoint = [parent, index + 1];
      if (index > 0 && (block(child) || block(children[index - 1]))) {
        segments.push({ text: "\n", start: before, end: [child, 0] });
      }
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent ?? "";
        segments.push({ text, start: [child, 0], end: [child, text.length], textNode: child as Text });
      } else if (child instanceof HTMLElement && child.dataset.skillCommand) {
        segments.push({ text: child.dataset.skillCommand, start: before, end: after });
      } else if (child instanceof HTMLElement && child.tagName === "BR") {
        // Chromium leaves a final BR as a caret placeholder, not another line.
        if (index < children.length - 1) segments.push({ text: "\n", start: before, end: after });
      } else {
        walk(child);
      }
    });
  };
  walk(root);
  return segments;
}

/** Skill labels occupy one DOM node but serialize to their full slash command. */
export function editorText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node instanceof HTMLElement && node.dataset.skillCommand) return node.dataset.skillCommand;
  return editorSegments(node).map((segment) => segment.text).join("");
}

export function editorSelection(root: HTMLElement): { start: number; end: number } | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const prefix = document.createRange();
  prefix.selectNodeContents(root);
  prefix.setEnd(range.startContainer, range.startOffset);
  const start = editorText(prefix.cloneContents()).length;
  prefix.setEnd(range.endContainer, range.endOffset);
  return { start, end: editorText(prefix.cloneContents()).length };
}

export function selectEditorRange(root: HTMLElement, start: number, end = start): void {
  const segments = editorSegments(root);
  const point = (offset: number): DomPoint => {
    for (const segment of segments) {
      if (offset > segment.text.length) { offset -= segment.text.length; continue; }
      if (segment.textNode) return [segment.textNode, offset];
      return offset > 0 ? segment.end : segment.start;
    }
    return [root, root.childNodes.length];
  };
  const range = document.createRange();
  range.setStart(...point(Math.max(0, start)));
  range.setEnd(...point(Math.max(0, end)));
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}
