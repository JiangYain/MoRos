import { type ModelRegistry, SessionManager } from "@earendil-works/pi-coding-agent";
import type { Api, Model } from "@earendil-works/pi-ai";
import { completeSimple } from "@earendil-works/pi-ai/compat";
import type { AppLanguage, SessionContentMatch, UiArchivedSessionInfo, UiSessionInfo, UiThreadItem } from "@shared/types";
import { DEFAULT_SUMMARY_MODEL } from "../../shared/types.ts";
import { compactSkillText } from "../../shared/skill-display.ts";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  SESSION_CONTENT_QUERY_MIN_LENGTH,
  searchSessionContentFiles,
} from "../session-content-search.ts";
import { mergeActiveSession } from "../session-list.ts";
import { buildSessionTitleTranscript, normalizeGeneratedSessionTitle } from "../session-title.ts";
import type { AppSettings } from "../settings";
import { agentMessage } from "./messages.ts";

interface StoredSessionInfo {
  path: string;
  id: string;
  cwd: string;
  name?: string;
  firstMessage: string;
  created: Date;
  modified: Date;
  messageCount: number;
}

interface StoredArchivedSessionInfo extends StoredSessionInfo {
  /**
   * Filesystem change time of the archived file. Moving a file into the
   * archive updates it on both NTFS and POSIX, so it approximates the archive
   * moment; the session's own modified time is the fallback.
   */
  archivedAt: Date;
}

interface SessionDocument {
  appendSessionInfo(name: string): void;
  getSessionName(): string | undefined;
}

export interface SessionStorage {
  list(workspaceDir: string): Promise<StoredSessionInfo[]>;
  listAll(): Promise<StoredSessionInfo[]>;
  listArchived(workspaceDir: string, archiveDir: string): Promise<StoredArchivedSessionInfo[]>;
  open(path: string): SessionDocument;
  ensureDirectory(path: string): Promise<void>;
  move(source: string, target: string): Promise<void>;
  remove(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

const nodeSessionStorage: SessionStorage = {
  list: (workspaceDir) => SessionManager.list(workspaceDir),
  listAll: () => SessionManager.listAll(),
  listArchived: async (workspaceDir, archiveDir) => {
    // An explicit directory makes SessionManager filter entries to sessions
    // created for this workspace; a missing directory lists as empty.
    const sessions = await SessionManager.list(workspaceDir, archiveDir);
    return Promise.all(sessions.map(async (info) => {
      let archivedAt = info.modified;
      try {
        const stats = await stat(info.path);
        if (stats.ctime.getTime() > archivedAt.getTime()) archivedAt = stats.ctime;
      } catch {
        // Keep the session's modified time when file metadata is unreadable.
      }
      return { ...info, archivedAt };
    }));
  },
  open: (path) => SessionManager.open(path),
  ensureDirectory: async (path) => {
    await mkdir(path, { recursive: true });
  },
  move: rename,
  remove: unlink,
  exists: async (path) => {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  },
};

export interface ActiveSessionView {
  path?: string;
  id: string;
  name?: string;
  setName(name: string): void;
}

export interface SessionLibraryState {
  workspaceDir: string;
  language: AppLanguage;
  active?: ActiveSessionView;
  thread: UiThreadItem[];
}

export interface SessionLibraryOptions {
  state(): SessionLibraryState;
  withActiveSessionDetached<Result>(
    path: ListedSessionPath,
    mutation: () => Promise<Result>,
  ): Promise<Result>;
  emitSessionsChanged(): void;
  generateTitle(transcript: string): Promise<string | null>;
  storage?: SessionStorage;
}

type MutationResult = { ok: boolean; error?: string };
export type SessionRemovalResult =
  | { ok: true; sessionId: string }
  | { ok: false; error: string };
declare const listedSessionPathBrand: unique symbol;
export type ListedSessionPath = string & { readonly [listedSessionPathBrand]: true };
export type ListedSessionPathResult =
  | { ok: true; path: ListedSessionPath; sessionDir: string; sessionId: string }
  | { ok: false; error: string };

function canonicalPath(path: string): string {
  return resolve(path);
}

export function sameSessionPath(first: string, second: string): boolean {
  const left = canonicalPath(first);
  const right = canonicalPath(second);
  return process.platform === "win32"
    ? left.toLocaleLowerCase("en-US") === right.toLocaleLowerCase("en-US")
    : left === right;
}

function isInsideDirectory(directory: string, path: string): boolean {
  const offset = relative(directory, path);
  return Boolean(offset) && !offset.startsWith("..") && !isAbsolute(offset);
}

/**
 * Owns safe access to persisted sessions, including the listed-path invariant,
 * active-session handoff, filesystem mutations, and best-effort automatic
 * titles. Callers never manipulate session files directly.
 */
export class SessionLibrary {
  private readonly storage: SessionStorage;
  private readonly titleRequests = new Set<string>();
  private readonly options: SessionLibraryOptions;

  constructor(options: SessionLibraryOptions) {
    this.options = options;
    this.storage = options.storage ?? nodeSessionStorage;
  }

  async list(): Promise<UiSessionInfo[]> {
    const workspaceDir = this.options.state().workspaceDir;
    const rawSessions = await this.storage.listAll();
    const sessions = rawSessions.map((info) => {
      const displayName = info.name ? compactSkillText(info.name) : undefined;
      const firstMessage = compactSkillText(info.firstMessage);
      return {
        path: info.path,
        id: info.id,
        cwd: info.cwd.trim() || null,
        name: displayName
          ? displayName.text || (displayName.skillName ? `Skill: ${displayName.skillName}` : info.name)
          : info.name,
        firstMessage: firstMessage.text
          || (firstMessage.skillName ? `Skill: ${firstMessage.skillName}` : info.firstMessage),
        createdAt: info.created.getTime(),
        modifiedAt: info.modified.getTime(),
        messageCount: info.messageCount,
      };
    });

    // Session discovery is asynchronous. Read the active projection after it
    // completes so a concurrent session switch cannot reintroduce stale data.
    const state = this.options.state();
    const firstUser = state.thread.find((item) => item.kind === "user");
    const active = firstUser && state.active?.path
      ? {
          path: state.active.path,
          id: state.active.id,
          cwd: state.workspaceDir,
          name: state.active.name,
          firstMessage: firstUser.text.trim()
            || (firstUser.images?.length ? "Image attachment" : "Untitled session"),
          createdAt: firstUser.ts,
          modifiedAt: state.thread.reduce((latest, item) => Math.max(latest, item.ts), firstUser.ts),
          messageCount: state.thread.filter(
            (item) => item.kind === "user" || item.kind === "assistant",
          ).length,
        }
      : undefined;
    return mergeActiveSession(sessions, active);
  }

  /**
   * Searches the stored user/assistant text of every listed session for the
   * query. Only files from the current workspace listing are read, keeping
   * the canonical allow-list as the single access path.
   */
  async searchContent(query: string): Promise<SessionContentMatch[]> {
    if (query.trim().length < SESSION_CONTENT_QUERY_MIN_LENGTH) return [];
    const state = this.options.state();
    const storedSessions = await this.storage.list(state.workspaceDir);
    const anchorPath = storedSessions[0]?.path;
    if (!anchorPath) return [];
    return searchSessionContentFiles(
      query,
      storedSessions.map((info) => ({
        id: info.id,
        path: info.path,
        modifiedAt: info.modified.getTime(),
      })),
      { sessionDir: canonicalPath(dirname(anchorPath)) },
    );
  }

  /**
   * Resolves an untrusted session path to the canonical path owned by the
   * current workspace's session listing. Callers must use the returned path,
   * never the transport-provided spelling.
   */
  async resolveListedPath(path: string): Promise<ListedSessionPathResult> {
    const state = this.options.state();
    const storedSessions = await this.storage.listAll();
    const listedSessions = storedSessions.map((session) => ({
      path: session.path,
      sessionId: session.id,
    }));
    const active = state.active?.path
      ? { path: state.active.path, sessionId: state.active.id }
      : undefined;
    if (active && !listedSessions.some((listed) => sameSessionPath(listed.path, active.path))) {
      listedSessions.push(active);
    }

    const listedSession = listedSessions.find((candidate) => sameSessionPath(candidate.path, path));
    if (!listedSession) {
      return { ok: false, error: agentMessage(state.language, "sessionInvalid") };
    }

    const resolvedPath = canonicalPath(listedSession.path);
    const sessionDir = canonicalPath(dirname(resolvedPath));
    return {
      ok: true,
      path: resolvedPath as ListedSessionPath,
      sessionDir,
      sessionId: listedSession.sessionId,
    };
  }

  async requireListedPath(path: string): Promise<ListedSessionPath> {
    const resolved = await this.resolveListedPath(path);
    if (!resolved.ok) throw new Error(resolved.error);
    return resolved.path;
  }

  async rename(path: string, name: string): Promise<MutationResult> {
    const allowed = await this.resolveListedPath(path);
    if (!allowed.ok) return allowed;
    const trimmed = name.trim();
    if (!trimmed) {
      return { ok: false, error: agentMessage(this.options.state().language, "nameEmpty") };
    }
    try {
      this.storage.open(allowed.path).appendSessionInfo(trimmed);
      this.options.emitSessionsChanged();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async archive(path: string): Promise<SessionRemovalResult> {
    const allowed = await this.resolveListedPath(path);
    if (!allowed.ok) return allowed;
    try {
      const archiveDir = join(allowed.sessionDir, "archive");
      await this.storage.ensureDirectory(archiveDir);
      const targetPath = join(archiveDir, basename(allowed.path));
      if (sameSessionPath(targetPath, allowed.path)) {
        return {
          ok: false,
          error: agentMessage(this.options.state().language, "sessionArchived"),
        };
      }
      await this.options.withActiveSessionDetached(
        allowed.path,
        () => this.storage.move(allowed.path, targetPath),
      );
      this.options.emitSessionsChanged();
      return { ok: true, sessionId: allowed.sessionId };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Locates the archive directory that `archive()` moves sessions into. The
   * session directory is anchored on listed sessions (or the active session)
   * exactly like `resolveListedPath`, never on transport-provided input.
   */
  private async resolveArchiveDirectory(): Promise<
    | { ok: true; workspaceDir: string; sessionDir: string; archiveDir: string }
    | { ok: false; error: string }
  > {
    const state = this.options.state();
    const storedSessions = await this.storage.list(state.workspaceDir);
    const directoryAnchor = storedSessions[0]?.path ?? state.active?.path;
    if (!directoryAnchor) {
      return { ok: false, error: agentMessage(state.language, "sessionDirectory") };
    }
    const sessionDir = canonicalPath(dirname(directoryAnchor));
    return {
      ok: true,
      workspaceDir: state.workspaceDir,
      sessionDir,
      archiveDir: join(sessionDir, "archive"),
    };
  }

  async listArchived(): Promise<UiArchivedSessionInfo[]> {
    const location = await this.resolveArchiveDirectory();
    if (!location.ok) return [];
    const archived = await this.storage.listArchived(location.workspaceDir, location.archiveDir);
    return archived
      .map((info) => {
        const displayName = info.name ? compactSkillText(info.name) : undefined;
        const firstMessage = compactSkillText(info.firstMessage);
        return {
          path: info.path,
          id: info.id,
          name: displayName
            ? displayName.text || (displayName.skillName ? `Skill: ${displayName.skillName}` : info.name)
            : info.name,
          firstMessage: firstMessage.text
            || (firstMessage.skillName ? `Skill: ${firstMessage.skillName}` : info.firstMessage),
          archivedAt: info.archivedAt.getTime(),
        };
      })
      .sort((first, second) => second.archivedAt - first.archivedAt);
  }

  async restore(path: string): Promise<MutationResult> {
    const location = await this.resolveArchiveDirectory();
    if (!location.ok) return location;
    try {
      const archived = await this.storage.listArchived(location.workspaceDir, location.archiveDir);
      const listed = archived.find((candidate) => sameSessionPath(candidate.path, path));
      const resolvedPath = listed ? canonicalPath(listed.path) : undefined;
      if (!resolvedPath || !isInsideDirectory(location.archiveDir, resolvedPath)) {
        return {
          ok: false,
          error: agentMessage(this.options.state().language, "sessionNotInArchive"),
        };
      }
      const targetPath = join(location.sessionDir, basename(resolvedPath));
      if (await this.storage.exists(targetPath)) {
        // Restoring must never overwrite a live session file: rename() would
        // silently replace an existing target on both Windows and POSIX.
        return {
          ok: false,
          error: agentMessage(this.options.state().language, "restoreConflict"),
        };
      }
      await this.storage.move(resolvedPath, targetPath);
      this.options.emitSessionsChanged();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async delete(path: string): Promise<SessionRemovalResult> {
    const allowed = await this.resolveListedPath(path);
    if (!allowed.ok) return allowed;
    try {
      await this.options.withActiveSessionDetached(
        allowed.path,
        () => this.storage.remove(allowed.path),
      );
      this.options.emitSessionsChanged();
      return { ok: true, sessionId: allowed.sessionId };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async generateMissingTitle(initial: SessionLibraryState = this.options.state()): Promise<void> {
    const sessionPath = initial.active?.path;
    if (!initial.active || !sessionPath || initial.active.name || this.titleRequests.has(sessionPath)) return;

    const hasAssistantText = initial.thread.some(
      (item) => item.kind === "assistant"
        && item.blocks.some((block) => block.type === "text" && block.text.trim()),
    );
    if (!hasAssistantText) return;
    const transcript = buildSessionTitleTranscript(initial.thread);
    if (!transcript) return;

    this.titleRequests.add(sessionPath);
    try {
      const title = await this.options.generateTitle(transcript);
      if (!title) return;

      const persistedSession = this.storage.open(sessionPath);
      if (persistedSession.getSessionName()) return;
      const current = this.options.state().active;
      if (current?.path === sessionPath && !current.name) {
        current.setName(title);
      } else {
        persistedSession.appendSessionInfo(title);
        this.options.emitSessionsChanged();
      }
    } catch {
      // Title generation is best-effort and must never interrupt conversation.
    } finally {
      this.titleRequests.delete(sessionPath);
    }
  }

}

export function createSessionTitleGenerator(options: {
  settings(): AppSettings;
  registry(): ModelRegistry;
  isConnectable(model: Model<Api>): boolean;
}): (transcript: string) => Promise<string | null> {
  return async (transcript) => {
    const selection = options.settings().summaryModel ?? DEFAULT_SUMMARY_MODEL;
    const registry = options.registry();
    const model = registry.find(selection.provider, selection.id);
    if (!model || !options.isConnectable(model)) return null;
    const auth = await registry.getApiKeyAndHeaders(model);
    if (!auth.ok) return null;

    const response = await completeSimple(
      model,
      {
        systemPrompt: [
          "Generate a concise title for this conversation.",
          "Match the conversation language.",
          "Use 4-12 Chinese characters or 3-8 English words.",
          "Return only the title with no quotes, markdown, labels, or punctuation.",
        ].join(" "),
        messages: [{ role: "user", content: transcript, timestamp: Date.now() }],
      },
      {
        apiKey: auth.apiKey,
        headers: auth.headers,
        env: auth.env,
        maxTokens: 80,
        reasoning: "minimal",
      },
    );
    if (response.stopReason === "error" || response.stopReason === "aborted") return null;
    return normalizeGeneratedSessionTitle(
      response.content
        .filter((content) => content.type === "text")
        .map((content) => content.text)
        .join("\n"),
    );
  };
}
