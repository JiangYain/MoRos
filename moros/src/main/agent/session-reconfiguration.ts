import { SessionManager } from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";

export function prepareSessionForReconfiguration(
  manager: SessionManager,
  unpersistedMessage: string,
): string | SessionManager {
  const path = manager.getSessionFile();
  if (path && existsSync(path)) return path;

  const entries = manager.getEntries();
  if (entries.some((entry) => !["model_change", "thinking_level_change", "session_info"].includes(entry.type))) {
    throw new Error(unpersistedMessage);
  }

  // Pi allocates a file name before the first assistant response writes it.
  // Opening that missing file loses the empty session's cwd and identity.
  const options = { id: manager.getSessionId() };
  const copy = manager.isPersisted()
    ? SessionManager.create(manager.getCwd(), manager.getSessionDir(), options)
    : SessionManager.inMemory(manager.getCwd(), options);
  for (const entry of entries) {
    if (entry.type === "model_change") copy.appendModelChange(entry.provider, entry.modelId);
    else if (entry.type === "thinking_level_change") copy.appendThinkingLevelChange(entry.thinkingLevel);
    else if (entry.type === "session_info") copy.appendSessionInfo(entry.name ?? "");
  }
  return copy;
}
