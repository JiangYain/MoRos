import type { UiThreadItem } from "@shared/types";
import { useEffect, useState } from "react";

type UserThreadItem = Extract<UiThreadItem, { kind: "user" }>;

export interface PromptRailEntry {
  prompt: UserThreadItem;
  response: string;
}

export function buildPromptRailEntries(items: UiThreadItem[]): PromptRailEntry[] {
  const entries: PromptRailEntry[] = [];
  let current: PromptRailEntry | undefined;

  for (const item of items) {
    if (item.kind === "user") {
      current = { prompt: item, response: "" };
      entries.push(current);
      continue;
    }

    if (item.kind !== "assistant" || !current) continue;
    const reply = item.blocks
      .filter((block) => block.type === "text")
      .map((block) => block.text.trim())
      .filter(Boolean)
      .join("\n\n");
    if (!reply) continue;
    current.response = [current.response, reply].filter(Boolean).join("\n\n");
  }

  return entries;
}

export function ThreadPromptRail({
  entries,
  scrollRoot,
}: {
  entries: PromptRailEntry[];
  scrollRoot: React.RefObject<HTMLDivElement | null>;
}): React.JSX.Element | null {
  const [activePromptId, setActivePromptId] = useState(entries.at(-1)?.prompt.id);

  useEffect(() => {
    const root = scrollRoot.current;
    if (!root || entries.length === 0) return;

    let frame = 0;
    const updateActivePrompt = (): void => {
      frame = 0;
      const focusY = root.getBoundingClientRect().top + root.clientHeight * 0.28;
      const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-thread-prompt-id]"));
      let closestId = nodes[0]?.dataset.threadPromptId;
      let closestDistance = Number.POSITIVE_INFINITY;

      for (const node of nodes) {
        const distance = Math.abs(node.getBoundingClientRect().top - focusY);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestId = node.dataset.threadPromptId;
        }
      }

      if (closestId) setActivePromptId((current) => current === closestId ? current : closestId);
    };
    const scheduleUpdate = (): void => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateActivePrompt);
    };

    updateActivePrompt();
    root.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      root.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [entries, scrollRoot]);

  if (entries.length === 0) return null;

  const jumpToPrompt = (promptId: string): void => {
    const root = scrollRoot.current;
    const target = Array.from(root?.querySelectorAll<HTMLElement>("[data-thread-prompt-id]") ?? [])
      .find((node) => node.dataset.threadPromptId === promptId);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <nav className="thread-prompt-rail" aria-label="Conversation prompts">
      {entries.map(({ prompt, response }, index) => {
        const summary = prompt.text.trim() || prompt.skillName || "Image prompt";
        const edgeClass = index === 0
          ? " first"
          : index === entries.length - 1
            ? " last"
            : "";

        return (
          <button
            key={prompt.id}
            type="button"
            className={`thread-prompt-marker${activePromptId === prompt.id ? " active" : ""}${edgeClass}`}
            aria-label={`Prompt ${index + 1}: ${summary}`}
            onClick={() => jumpToPrompt(prompt.id)}
          >
            <span className="thread-prompt-marker-dash" aria-hidden />
            <span className="thread-prompt-preview" role="tooltip">
              <span className="thread-prompt-preview-prompt">{summary}</span>
              <span className="thread-prompt-preview-response">{response || "…"}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
