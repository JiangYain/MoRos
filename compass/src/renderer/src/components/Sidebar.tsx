import type { AppLanguage, UiSessionInfo } from "@shared/types";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Archive,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Ear,
  Folder,
  FolderOpen,
  Gauge,
  MoreHorizontal,
  Pencil,
  Plus,
  Puzzle,
  Search,
  Settings,
  Sparkles,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../ipc";
import { localeFor, useI18n } from "../i18n";
import { useCompass } from "../store";
import { ClientProfileDialog } from "./ClientProfileDialog";
import { ProfileAvatar } from "./ProfileAvatar";
import { SessionSearchOverlay, type SessionSearchEntry } from "./SessionSearchOverlay";
import { ThreadInlineConfirmation } from "./ThreadInlineConfirmation";
import {
  type ThreadConfirmationState,
  threadConfirmationsReducer,
} from "./thread-confirmation";
import {
  clampSidebarWidth,
  parseSidebarWidth,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from "./sidebar-width";
import {
  type ClientProfileDraft,
  type ClientRegistry,
  clientRegistryKey,
  normalizeClientName,
} from "./client-registry";

interface ClientGroup {
  id: string;
  name: string;
  sessions: UiSessionInfo[];
  latestModifiedAt: number;
  unassigned: boolean;
}

interface ContextMenuState {
  x: number;
  y: number;
  alignRight: boolean;
  session: UiSessionInfo;
}

interface SidebarResizeState {
  pointerId: number;
  startX: number;
  startWidth: number;
  currentWidth: number;
}

interface DraggedSessionState {
  sessionId: string;
  clientId: string;
}

type SessionOrderByClient = Record<string, string[]>;

function OpenAIComposeIcon({ size = 16 }: { size?: number }): React.JSX.Element {
  return (
    <svg
      className="openai-compose-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M13.5 4.5H7A2.5 2.5 0 0 0 4.5 7v10A2.5 2.5 0 0 0 7 19.5h10a2.5 2.5 0 0 0 2.5-2.5v-6.5"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m9 15 .58-2.88 7.9-7.9a1.62 1.62 0 0 1 2.3 2.3l-7.9 7.9L9 15Z"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const SIDEBAR_WIDTH_STORAGE_KEY = "compass.sidebar.width.v1";
const SESSION_ORDER_STORAGE_KEY = "compass.sidebar.session-order.v1";
const SIDEBAR_TREE_ICON_SIZE = 16;
const CLIENT_SESSION_PREVIEW_LIMIT = 5;
const UNASSIGNED_CLIENT = {
  id: "client:unassigned",
  name: "未关联客户",
  unassigned: true,
} satisfies Pick<ClientGroup, "id" | "name" | "unassigned">;

const CLIENT_PATTERNS = [
  /(?:客户|顾客)[ \t]*(?:姓名|名称|档案)?[ \t]*[:：][ \t]*([^\n，,。；;]+)/i,
  /(?:打开|选择|进入|新建)[ \t]*(?:客户|顾客)[ \t]*[:：][ \t]*([^\n，,。；;]+)/i,
  /(?:打开|选择|进入|新建)[ \t]*(?:客户|顾客)[ \t]+([^\n，,。；;]+)/i,
  /client[ \t]*(?:name|profile)?[ \t]*[:：][ \t]*([^\n,.;]+)/i,
];

function sessionTitle(session: UiSessionInfo, untitled: string): string {
  return session.name?.trim() || session.firstMessage.trim() || untitled;
}

function normalizedSessionDate(value: number): Date {
  return new Date(value > 0 && value < 1_000_000_000_000 ? value * 1_000 : value);
}

function sessionTime(
  session: UiSessionInfo,
  language: AppLanguage,
  t: ReturnType<typeof useI18n>["t"],
): string {
  const date = normalizedSessionDate(session.createdAt || session.modifiedAt);
  if (Number.isNaN(date.getTime())) return t("common.unknown");
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const time = new Intl.DateTimeFormat(localeFor(language), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  if (startOfDate === startOfToday) return `${t("common.today")} ${time}`;
  if (startOfDate === startOfToday - 86_400_000) return `${t("common.yesterday")} ${time}`;
  return new Intl.DateTimeFormat(localeFor(language), {
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" as const }),
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function sessionRelativeAge(session: UiSessionInfo, nowLabel: string, now = Date.now()): string {
  const date = normalizedSessionDate(session.createdAt || session.modifiedAt);
  if (Number.isNaN(date.getTime())) return "—";
  const elapsed = Math.max(0, now - date.getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return nowLabel;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(days / 365)}y`;
}

function sessionDateTime(session: UiSessionInfo): string | undefined {
  const date = normalizedSessionDate(session.createdAt || session.modifiedAt);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function isPlausibleClientName(value: string): boolean {
  return Boolean(value) && !value.includes("```") && !/[<>]/.test(value);
}

function clientIdentity(name: string): Pick<ClientGroup, "id" | "name" | "unassigned"> {
  return {
    id: `client:${name.toLocaleLowerCase("zh-CN")}`,
    name,
    unassigned: false,
  };
}

function inferClient(
  session: UiSessionInfo,
  registry: ClientRegistry,
): Pick<ClientGroup, "id" | "name" | "unassigned"> {
  const assignedName = normalizeClientName(registry.assignments[session.id] ?? "");
  if (assignedName) return clientIdentity(assignedName);
  const source = `${session.name ?? ""}\n${session.firstMessage ?? ""}`;
  for (const pattern of CLIENT_PATTERNS) {
    const match = pattern.exec(source);
    const clientName = match?.[1] ? normalizeClientName(match[1]) : "";
    if (isPlausibleClientName(clientName)) {
      return clientIdentity(clientName);
    }
  }
  return UNASSIGNED_CLIENT;
}

function groupSessionsByClient(sessions: UiSessionInfo[], registry: ClientRegistry): ClientGroup[] {
  const groups = new Map<string, ClientGroup>();
  for (const name of registry.clients) {
    const client = clientIdentity(name);
    groups.set(client.id, { ...client, sessions: [], latestModifiedAt: 0 });
  }
  for (const session of sessions) {
    const client = inferClient(session, registry);
    const existing = groups.get(client.id);
    if (existing) {
      existing.sessions.push(session);
      existing.latestModifiedAt = Math.max(existing.latestModifiedAt, session.modifiedAt);
    } else {
      groups.set(client.id, {
        ...client,
        sessions: [session],
        latestModifiedAt: session.modifiedAt,
      });
    }
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      sessions: [...group.sessions].sort((a, b) => b.modifiedAt - a.modifiedAt),
    }))
    .sort((a, b) => {
      if (a.unassigned !== b.unassigned) return a.unassigned ? 1 : -1;
      return b.latestModifiedAt - a.latestModifiedAt;
    });
}

function readSessionOrder(): SessionOrderByClient {
  try {
    const value = JSON.parse(window.localStorage.getItem(SESSION_ORDER_STORAGE_KEY) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).flatMap(([clientId, sessionIds]) => (
        Array.isArray(sessionIds)
          ? [[clientId, sessionIds.filter((sessionId): sessionId is string => typeof sessionId === "string")]]
          : []
      )),
    );
  } catch {
    return {};
  }
}

function orderSessions(sessions: UiSessionInfo[], order: string[] | undefined): UiSessionInfo[] {
  if (!order?.length) return sessions;
  const rank = new Map(order.map((sessionId, index) => [sessionId, index]));
  return sessions
    .map((session, index) => ({ session, index }))
    .sort((left, right) => {
      const leftRank = rank.get(left.session.id);
      const rightRank = rank.get(right.session.id);
      if (leftRank === undefined && rightRank === undefined) return left.index - right.index;
      if (leftRank === undefined) return 1;
      if (rightRank === undefined) return -1;
      return leftRank - rightRank;
    })
    .map(({ session }) => session);
}

export function Sidebar(): React.JSX.Element {
  const { language, t } = useI18n();
  const sessions = useCompass((state) => state.sessions);
  const stats = useCompass((state) => state.stats);
  const settings = useCompass((state) => state.settings);
  const skills = useCompass((state) => state.skills);
  const profileName = useCompass((state) => state.profileName);
  const profileHandle = useCompass((state) => state.profileHandle);
  const newSession = useCompass((state) => state.newSession);
  const openSession = useCompass((state) => state.openSession);
  const renameSession = useCompass((state) => state.renameSession);
  const deleteSession = useCompass((state) => state.deleteSession);
  const archiveSession = useCompass((state) => state.archiveSession);
  const clientRegistry = useCompass((state) => state.clientRegistry);
  const persistClientProfile = useCompass((state) => state.saveClientProfile);
  const persistSessionClient = useCompass((state) => state.assignSessionClient);
  const removeSessionClient = useCompass((state) => state.unassignSessionClient);
  const setError = useCompass((state) => state.setError);
  const openSettings = useCompass((state) => state.openSettings);
  const sidebarOpen = useCompass((state) => state.sidebarOpen);
  const setSidebarOpen = useCompass((state) => state.setSidebarOpen);
  const mainView = useCompass((state) => state.mainView);
  const setMainView = useCompass((state) => state.setMainView);
  const reduced = useReducedMotion();
  const profileRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const sidebarResizeRef = useRef<SidebarResizeState | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      return parseSidebarWidth(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
    } catch {
      return SIDEBAR_DEFAULT_WIDTH;
    }
  });
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const [collapsedClients, setCollapsedClients] = useState<Record<string, boolean>>({});
  const [clientsCollapsed, setClientsCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [sessionConfirmations, dispatchSessionConfirmation] = useReducer(threadConfirmationsReducer, {});
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [sessionOrderByClient, setSessionOrderByClient] = useState<SessionOrderByClient>(readSessionOrder);
  const [revealedClientSessions, setRevealedClientSessions] = useState<Record<string, boolean>>({});
  const [draggedSession, setDraggedSession] = useState<DraggedSessionState | null>(null);
  const [dragOverClientId, setDragOverClientId] = useState<string | null>(null);
  const legacyAssignmentMigrations = useRef(new Set<string>());

  const clientGroups = useMemo(
    () => groupSessionsByClient(sessions, clientRegistry).map((group) => ({
      ...group,
      sessions: orderSessions(group.sessions, sessionOrderByClient[group.id]),
    })),
    [clientRegistry, sessionOrderByClient, sessions],
  );
  const activeSessionId = stats?.sessionId;
  const searchEntries = useMemo<SessionSearchEntry[]>(
    () => sessions.map((session) => {
      const client = inferClient(session, clientRegistry);
      return {
        id: session.id,
        path: session.path,
        title: sessionTitle(session, t("common.untitledSession")),
        time: sessionTime(session, language, t),
        client: client.unassigned ? t("sidebar.unassigned") : client.name,
        active: session.id === activeSessionId,
      };
    }),
    [activeSessionId, clientRegistry, language, sessions, t],
  );
  const enabledSkills = skills.filter((skill) => skill.enabled).length;
  const contextPercent = stats?.contextPercent == null ? null : Math.round(stats.contextPercent);
  const displayProfileName = profileName || t("settings.profile");

  useEffect(() => {
    if (!activeSessionId) return;
    const activeGroup = clientGroups.find((group) => (
      group.sessions.some((session) => session.id === activeSessionId)
    ));
    if (!activeGroup) return;
    const activeIndex = activeGroup.sessions.findIndex((session) => session.id === activeSessionId);
    if (activeIndex < CLIENT_SESSION_PREVIEW_LIMIT) return;
    setRevealedClientSessions((current) => (
      current[activeGroup.id] ? current : { ...current, [activeGroup.id]: true }
    ));
  }, [activeSessionId, clientGroups]);

  useEffect(() => {
    const knownClients = new Map(
      clientRegistry.clients.map((name) => [clientRegistryKey(name), name]),
    );
    for (const session of sessions) {
      if (clientRegistry.assignments[session.id] || legacyAssignmentMigrations.current.has(session.id)) continue;
      const inferred = inferClient(session, clientRegistry);
      const knownName = inferred.unassigned ? undefined : knownClients.get(clientRegistryKey(inferred.name));
      if (!knownName) continue;
      legacyAssignmentMigrations.current.add(session.id);
      void persistSessionClient(session.id, knownName).catch(() => {
        legacyAssignmentMigrations.current.delete(session.id);
      });
    }
  }, [clientRegistry, persistSessionClient, sessions]);

  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) {
      setContextMenuPosition(null);
      return;
    }
    const padding = 8;
    const bounds = contextMenuRef.current.getBoundingClientRect();
    const preferredLeft = contextMenu.alignRight ? contextMenu.x - bounds.width : contextMenu.x;
    const maxLeft = Math.max(padding, window.innerWidth - bounds.width - padding);
    const maxTop = Math.max(padding, window.innerHeight - bounds.height - padding);
    setContextMenuPosition({
      left: Math.max(padding, Math.min(preferredLeft, maxLeft)),
      top: Math.max(padding, Math.min(contextMenu.y, maxTop)),
    });
  }, [contextMenu]);

  useEffect(() => {
    const closeMenus = (event: MouseEvent): void => {
      setContextMenu(null);
      setContextMenuPosition(null);
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };
    const closeMenusWithKeyboard = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      setContextMenu(null);
      setContextMenuPosition(null);
      setProfileOpen(false);
      dispatchSessionConfirmation({ type: "clear-idle" });
    };
    document.addEventListener("mousedown", closeMenus);
    document.addEventListener("keydown", closeMenusWithKeyboard);
    return () => {
      document.removeEventListener("mousedown", closeMenus);
      document.removeEventListener("keydown", closeMenusWithKeyboard);
    };
  }, []);

  useEffect(() => {
    const openSessionSearch = (): void => {
      setSearchOpen(true);
      if (window.matchMedia("(max-width: 760px)").matches) setSidebarOpen(false);
    };
    window.addEventListener("compass:open-session-search", openSessionSearch);
    return () => window.removeEventListener("compass:open-session-search", openSessionSearch);
  }, [setSidebarOpen]);

  useEffect(() => {
    document.body.classList.toggle("sidebar-resizing", sidebarResizing);
    return () => document.body.classList.remove("sidebar-resizing");
  }, [sidebarResizing]);

  const saveSidebarWidth = (width: number): void => {
    const next = clampSidebarWidth(width);
    setSidebarWidth(next);
    try {
      window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(next));
    } catch {
      // Keep resizing functional when browser storage is unavailable.
    }
  };

  const closeMobileSidebar = (): void => {
    if (window.matchMedia("(max-width: 760px)").matches) setSidebarOpen(false);
  };

  const finishSidebarResize = (): void => {
    const resize = sidebarResizeRef.current;
    if (!resize) return;
    sidebarResizeRef.current = null;
    setSidebarResizing(false);
    saveSidebarWidth(resize.currentWidth);
  };

  const beginSidebarResize = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    sidebarResizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: sidebarWidth,
      currentWidth: sidebarWidth,
    };
    setSidebarResizing(true);
  };

  const moveSidebarResize = (event: React.PointerEvent<HTMLDivElement>): void => {
    const resize = sidebarResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const next = clampSidebarWidth(resize.startWidth + event.clientX - resize.startX);
    resize.currentWidth = next;
    setSidebarWidth(next);
  };

  const endSidebarResize = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    finishSidebarResize();
  };

  const resizeSidebarWithKeyboard = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const delta = event.shiftKey ? 24 : 8;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      saveSidebarWidth(sidebarWidth - delta);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      saveSidebarWidth(sidebarWidth + delta);
    } else if (event.key === "Home") {
      event.preventDefault();
      saveSidebarWidth(SIDEBAR_MIN_WIDTH);
    } else if (event.key === "End") {
      event.preventDefault();
      saveSidebarWidth(SIDEBAR_MAX_WIDTH);
    }
  };

  const toggleClient = (clientId: string): void => {
    setCollapsedClients((current) => ({ ...current, [clientId]: !current[clientId] }));
  };

  const createThreadForClient = async (group: ClientGroup): Promise<void> => {
    closeMobileSidebar();
    const created = await newSession();
    if (!created || group.unassigned) return;
    const sessionId = useCompass.getState().stats?.sessionId;
    if (sessionId) await persistSessionClient(sessionId, group.name);
  };

  const persistSessionOrder = (next: SessionOrderByClient): void => {
    setSessionOrderByClient(next);
    try {
      window.localStorage.setItem(SESSION_ORDER_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Session ordering remains available for the current window when storage is unavailable.
    }
  };

  const reorderSession = (group: ClientGroup, sessionId: string, beforeSessionId: string): void => {
    if (sessionId === beforeSessionId) return;
    const ids = group.sessions.map((session) => session.id);
    const fromIndex = ids.indexOf(sessionId);
    const targetIndex = ids.indexOf(beforeSessionId);
    if (fromIndex < 0 || targetIndex < 0) return;
    ids.splice(fromIndex, 1);
    ids.splice(targetIndex, 0, sessionId);
    persistSessionOrder({ ...sessionOrderByClient, [group.id]: ids });
  };

  const dropSessionIntoGroup = (group: ClientGroup, beforeSessionId?: string): void => {
    const dragged = draggedSession;
    if (!dragged) return;
    const targetIds = group.sessions
      .map((session) => session.id)
      .filter((sessionId) => sessionId !== dragged.sessionId);
    const targetIndex = beforeSessionId ? targetIds.indexOf(beforeSessionId) : -1;
    if (targetIndex >= 0) targetIds.splice(targetIndex, 0, dragged.sessionId);
    else targetIds.push(dragged.sessionId);

    const nextOrder = { ...sessionOrderByClient, [group.id]: targetIds };
    if (dragged.clientId !== group.id) {
      const source = clientGroups.find((candidate) => candidate.id === dragged.clientId);
      if (source) {
        nextOrder[source.id] = source.sessions
          .map((session) => session.id)
          .filter((sessionId) => sessionId !== dragged.sessionId);
      }
      if (group.unassigned) void removeSessionClient(dragged.sessionId);
      else void persistSessionClient(dragged.sessionId, group.name);
    }
    persistSessionOrder(nextOrder);
    setDraggedSession(null);
    setDragOverClientId(null);
  };

  const finishSessionDrag = (): void => {
    setDraggedSession(null);
    setDragOverClientId(null);
  };

  const closeThreadMenu = (): void => {
    setContextMenu(null);
    setContextMenuPosition(null);
  };

  const openThreadMenuAt = (
    x: number,
    y: number,
    session: UiSessionInfo,
    alignRight = false,
  ): void => {
    setContextMenuPosition(null);
    setContextMenu({ x, y, session, alignRight });
  };

  const openThreadContextMenu = (event: React.MouseEvent, session: UiSessionInfo): void => {
    event.preventDefault();
    event.stopPropagation();
    openThreadMenuAt(event.clientX, event.clientY, session);
  };

  const openThreadActionMenu = (
    event: React.MouseEvent<HTMLButtonElement>,
    session: UiSessionInfo,
  ): void => {
    event.preventDefault();
    event.stopPropagation();
    const bounds = event.currentTarget.getBoundingClientRect();
    openThreadMenuAt(bounds.right, bounds.bottom + 4, session, true);
  };

  const copySessionId = async (session: UiSessionInfo): Promise<void> => {
    try {
      await navigator.clipboard.writeText(session.id);
    } catch {
      setError(t("sidebar.copyIdFailed"));
    }
    closeThreadMenu();
  };

  const startRename = (session: UiSessionInfo): void => {
    setRenamingPath(session.path);
    setRenameDraft(sessionTitle(session, t("common.untitledSession")));
    closeThreadMenu();
  };

  const commitRename = (path: string): void => {
    const nextName = renameDraft.trim();
    if (!nextName) {
      setError(t("sidebar.renameEmpty"));
      requestAnimationFrame(() => renameInputRef.current?.focus());
      return;
    }
    setRenamingPath(null);
    setError(null);
    void renameSession(path, nextName);
  };

  const cancelRename = (): void => {
    setRenamingPath(null);
    setRenameDraft("");
  };

  const saveClientProfile = (profile: ClientProfileDraft): void => {
    void persistClientProfile(profile);
    setClientDialogOpen(false);
  };

  const requestSessionAction = (
    session: UiSessionInfo,
    action: ThreadConfirmationState["action"],
  ): void => {
    closeThreadMenu();
    dispatchSessionConfirmation({ type: "request", path: session.path, action });
  };

  const confirmSessionAction = async (confirmation: ThreadConfirmationState): Promise<void> => {
    if (confirmation.busy) return;
    dispatchSessionConfirmation({
      type: "start",
      path: confirmation.path,
      action: confirmation.action,
    });
    if (confirmation.action === "delete") await deleteSession(confirmation.path);
    else await archiveSession(confirmation.path);
    dispatchSessionConfirmation({
      type: "clear",
      path: confirmation.path,
      action: confirmation.action,
    });
  };

  const availableClientNames = clientGroups
    .filter((group) => !group.unassigned)
    .map((group) => group.name);
  return (
    <aside
      className={`sidebar${sidebarOpen ? " mobile-open" : " collapsed"}${sidebarResizing ? " resizing" : ""}`}
      style={{ "--sidebar-w": `${sidebarWidth}px` } as React.CSSProperties}
    >
      <SessionSearchOverlay
        entries={searchEntries}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={(entry) => {
          setSearchOpen(false);
          if (entry.active) setMainView("assistant");
          else void openSession(entry.path);
        }}
      />

      <nav className="sidebar-nav" aria-label="Compass">
        <div className="sidebar-brand-row">
          <div className="sidebar-brand-name" aria-label="Compass.">
            <span>Compass</span>
            <span className="sidebar-brand-dot">.</span>
          </div>
          <button
            type="button"
            className={`sidebar-brand-search${searchOpen ? " active" : ""}`}
            aria-label={t("sidebar.search")}
            title={t("sidebar.search")}
            aria-expanded={searchOpen}
            aria-controls="session-search-dialog"
            onClick={() => {
              setSearchOpen(true);
              closeMobileSidebar();
            }}
          >
            <Search size={17} strokeWidth={1.65} aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          className="sidebar-nav-item"
          onClick={() => {
            closeMobileSidebar();
            void newSession();
          }}
        >
          <SquarePen size={16} strokeWidth={1.65} aria-hidden="true" />
          <span>{t("sidebar.new")}</span>
        </button>
        <button
          type="button"
          className={`sidebar-nav-item${mainView === "hearing-health" ? " active" : ""}`}
          aria-current={mainView === "hearing-health" ? "page" : undefined}
          onClick={() => {
            closeMobileSidebar();
            setMainView("hearing-health");
          }}
        >
          <Ear size={16} strokeWidth={1.65} aria-hidden="true" />
          <span>{t("sidebar.hearingHealth")}</span>
        </button>
        <button
          type="button"
          className="sidebar-nav-item"
          onClick={() => {
            closeMobileSidebar();
            openSettings("skills");
          }}
        >
          <Puzzle size={16} strokeWidth={1.65} aria-hidden="true" />
          <span>{t("sidebar.skills")}</span>
          <span className="nav-count">{enabledSkills}</span>
        </button>
      </nav>

      <div className="file-tree">
        {clientGroups.length === 0 ? (
          <div className="empty-state">{t("sidebar.empty")}</div>
        ) : (
          <div className="file-section">
            <div className="file-section-header">
              <button
                type="button"
                className="file-section-header-main"
                aria-expanded={!clientsCollapsed}
                onClick={() => setClientsCollapsed((current) => !current)}
              >
                <span className="file-section-title">{t("sidebar.clients")}</span>
                <span className="file-section-header-right">
                  <span className="file-section-count">{clientGroups.length}</span>
                  <motion.span
                    className="file-section-toggle file-chevron"
                    animate={{ rotate: clientsCollapsed ? 0 : 90 }}
                    transition={reduced ? { duration: 0 } : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <ChevronRight size={SIDEBAR_TREE_ICON_SIZE} strokeWidth={1.6} aria-hidden="true" />
                  </motion.span>
                </span>
              </button>
              <button
                type="button"
                className="file-section-add"
                aria-label={t("sidebar.newClient")}
                title={t("sidebar.newClient")}
                onClick={() => setClientDialogOpen(true)}
              >
                <Plus size={SIDEBAR_TREE_ICON_SIZE} strokeWidth={1.6} />
              </button>
            </div>

            <AnimatePresence initial={false}>
              {!clientsCollapsed && (
              <motion.div
                key="client-section-content"
                className="file-section-content"
                initial={reduced ? false : { height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={reduced ? { duration: 0 } : {
                  height: { duration: 0.26, ease: [0.2, 0, 0, 1] },
                  opacity: { duration: 0.12, ease: "easeOut" },
                }}
              >
                {clientGroups.map((group, index) => {
                  const activeClient = group.sessions.some(
                    (session) => session.id === activeSessionId,
                  );
                  const expanded = !collapsedClients[group.id];
                  const sessionsRevealed = Boolean(revealedClientSessions[group.id]);
                  const visibleSessions = sessionsRevealed
                    ? group.sessions
                    : group.sessions.slice(0, CLIENT_SESSION_PREVIEW_LIMIT);
                  const hiddenSessionCount = group.sessions.length - visibleSessions.length;
                  const FolderIcon = expanded ? FolderOpen : Folder;
                  return (
                    <motion.div
                      key={group.id}
                      className="file-tree-item"
                      data-active-client={activeClient || undefined}
                      initial={reduced ? false : { opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.24,
                        delay: Math.min(index * 0.02, 0.14),
                        ease: [0.22, 1, 0.36, 1],
                      }}
                    >
                      <div
                        className={`file-item folder-row${dragOverClientId === group.id ? " drag-over" : ""}`}
                        onDragEnter={() => {
                          if (draggedSession) setDragOverClientId(group.id);
                        }}
                        onDragOver={(event) => {
                          if (!draggedSession) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                        }}
                        onDragLeave={(event) => {
                          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                            setDragOverClientId((current) => current === group.id ? null : current);
                          }
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          dropSessionIntoGroup(group);
                        }}
                      >
                        <button
                          type="button"
                          className="file-item-main"
                          aria-expanded={expanded}
                          onClick={() => toggleClient(group.id)}
                        >
                          <span className="file-icon">
                            <AnimatePresence initial={false} mode="popLayout">
                              <motion.span
                                key={expanded ? "open" : "closed"}
                                className="file-icon-glyph"
                                initial={reduced ? false : { opacity: 0, scale: 0.82 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.82 }}
                                transition={reduced ? { duration: 0 } : { duration: 0.14, ease: "easeOut" }}
                              >
                                <FolderIcon size={SIDEBAR_TREE_ICON_SIZE} strokeWidth={1.55} />
                              </motion.span>
                            </AnimatePresence>
                          </span>
                          <span className="file-name">{group.unassigned ? t("sidebar.unassigned") : group.name}</span>
                          <motion.span
                            className="file-chevron"
                            animate={{ rotate: expanded ? 90 : 0 }}
                            transition={reduced ? { duration: 0 } : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                          >
                            <ChevronRight size={SIDEBAR_TREE_ICON_SIZE} strokeWidth={1.6} aria-hidden="true" />
                          </motion.span>
                        </button>
                        <button
                          type="button"
                          className="file-action-btn"
                          title={t("sidebar.newConversationFor", { name: group.unassigned ? t("sidebar.unassigned") : group.name })}
                          aria-label={t("sidebar.newConversationFor", { name: group.unassigned ? t("sidebar.unassigned") : group.name })}
                          onClick={() => void createThreadForClient(group)}
                        >
                          <OpenAIComposeIcon size={SIDEBAR_TREE_ICON_SIZE} />
                        </button>
                      </div>

                      <AnimatePresence initial={false}>
                        {expanded && (
                        <motion.div
                          key="client-threads"
                          className="file-children"
                          initial={reduced ? false : { height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={reduced ? { duration: 0 } : {
                            height: { duration: 0.26, ease: [0.2, 0, 0, 1] },
                            opacity: { duration: 0.12, ease: "easeOut" },
                          }}
                        >
                          {group.sessions.length === 0 && (
                            <div className="client-empty-label">{t("sidebar.noConversations")}</div>
                          )}
                          {visibleSessions.map((session) => {
                            const active = activeSessionId === session.id;
                            const renaming = renamingPath === session.path;
                            const confirmation = sessionConfirmations[session.path] ?? null;
                            const relativeAge = sessionRelativeAge(session, t("common.now"));
                            return (
                              <div
                                className={`file-tree-item thread-item-shell${active ? " active" : ""}${confirmation ? " confirming" : ""}${draggedSession?.sessionId === session.id ? " dragging" : ""}`}
                                key={session.path}
                                draggable={!renaming && !confirmation}
                                onDragStart={(event) => {
                                  event.dataTransfer.effectAllowed = "move";
                                  event.dataTransfer.setData("text/plain", session.id);
                                  setDraggedSession({ sessionId: session.id, clientId: group.id });
                                }}
                                onDragEnter={() => {
                                  if (!draggedSession) return;
                                  setDragOverClientId(group.id);
                                  if (draggedSession.clientId === group.id) {
                                    reorderSession(group, draggedSession.sessionId, session.id);
                                  }
                                }}
                                onDragOver={(event) => {
                                  if (!draggedSession) return;
                                  event.preventDefault();
                                  event.dataTransfer.dropEffect = "move";
                                }}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  dropSessionIntoGroup(group, session.id);
                                }}
                                onDragEnd={finishSessionDrag}
                                onContextMenu={(event) => openThreadContextMenu(event, session)}
                              >
                                {renaming ? (
                                  <div
                                    className="file-item thread-file-item renaming"
                                    onBlur={(event) => {
                                      const nextTarget = event.relatedTarget;
                                      if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                                        cancelRename();
                                      }
                                    }}
                                  >
                                    <input
                                      ref={renameInputRef}
                                      className="thread-rename-input"
                                      value={renameDraft}
                                      autoFocus
                                      onChange={(event) => setRenameDraft(event.target.value)}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") commitRename(session.path);
                                        if (event.key === "Escape") cancelRename();
                                      }}
                                    />
                                    <span className="thread-rename-actions">
                                      <button
                                        type="button"
                                        aria-label={t("sidebar.confirmRename")}
                                        title={t("sidebar.confirmRename")}
                                        onClick={() => commitRename(session.path)}
                                      >
                                        <Check size={12} strokeWidth={1.8} />
                                      </button>
                                      <button
                                        type="button"
                                        aria-label={t("sidebar.cancelRename")}
                                        title={t("common.cancel")}
                                        onClick={cancelRename}
                                      >
                                        <X size={12} strokeWidth={1.8} />
                                      </button>
                                    </span>
                                  </div>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      className={`file-item thread-file-item${active ? " active" : ""}`}
                                      onClick={() => {
                                        closeMobileSidebar();
                                        if (active) setMainView("assistant");
                                        else void openSession(session.path);
                                      }}
                                      title={`${sessionTime(session, language, t)} · ${relativeAge} · ${sessionTitle(session, t("common.untitledSession"))}`}
                                    >
                                      <span className="file-name">{sessionTitle(session, t("common.untitledSession"))}</span>
                                      <time className="thread-relative-time" dateTime={sessionDateTime(session)}>
                                        {relativeAge}
                                      </time>
                                    </button>
                                    <button
                                      type="button"
                                      className="thread-more-button"
                                      aria-label={`${t("sidebar.moreActions")}: ${sessionTime(session, language, t)}`}
                                      aria-expanded={contextMenu?.session.path === session.path}
                                      title={t("sidebar.moreActions")}
                                      onClick={(event) => openThreadActionMenu(event, session)}
                                    >
                                      <MoreHorizontal size={14} strokeWidth={1.65} aria-hidden="true" />
                                    </button>
                                  </>
                                )}
                                <AnimatePresence initial={false}>
                                  {confirmation && (
                                    <ThreadInlineConfirmation
                                      key={`${confirmation.path}:${confirmation.action}`}
                                      action={confirmation.action}
                                      busy={confirmation.busy}
                                      sessionTitle={sessionTitle(session, t("common.untitledSession"))}
                                      onCancel={() => dispatchSessionConfirmation({
                                        type: "clear",
                                        path: confirmation.path,
                                        action: confirmation.action,
                                      })}
                                      onConfirm={() => confirmSessionAction(confirmation)}
                                    />
                                  )}
                                </AnimatePresence>
                              </div>
                            );
                          })}
                          {group.sessions.length > CLIENT_SESSION_PREVIEW_LIMIT && (
                            <button
                              type="button"
                              className="show-more-sessions"
                              aria-label={sessionsRevealed
                                ? t("sidebar.showLess")
                                : `${t("sidebar.showMore")} (${hiddenSessionCount})`}
                              onClick={() => setRevealedClientSessions((current) => ({
                                ...current,
                                [group.id]: !sessionsRevealed,
                              }))}
                            >
                              <span>{t(sessionsRevealed ? "sidebar.showLess" : "sidebar.showMore")}</span>
                              {!sessionsRevealed && (
                                <span className="show-more-sessions-count" aria-hidden="true">
                                  {hiddenSessionCount}
                                </span>
                              )}
                            </button>
                          )}
                        </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      <div className="profile-shell" ref={profileRef}>
        <AnimatePresence>
          {profileOpen && (
            <motion.div
              className="profile-menu"
              initial={{ opacity: 0, y: 8, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.985 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <button
                type="button"
                className="profile-menu-head profile-menu-head-button"
                aria-label={t("sidebar.openProfile")}
                onClick={() => {
                  setProfileOpen(false);
                  closeMobileSidebar();
                  openSettings("profile");
                }}
              >
                <ProfileAvatar className="large" />
                <span>
                  <b>{displayProfileName}</b>
                  {profileHandle && <small>@{profileHandle}</small>}
                </span>
              </button>
              <div className="profile-menu-rule" />
              <div className="profile-usage">
                <Gauge size={15} strokeWidth={1.6} />
                <span>{t("sidebar.contextUsage")}</span>
                <b>{contextPercent === null ? "—" : `${contextPercent}%`}</b>
              </div>
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  closeMobileSidebar();
                  if (settings?.workspaceDir) void api.openPath(settings.workspaceDir);
                }}
              >
                <FolderOpen size={15} strokeWidth={1.6} />
                <span>{t("sidebar.openWorkspace")}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  closeMobileSidebar();
                  openSettings("skills");
                }}
              >
                <Sparkles size={15} strokeWidth={1.6} />
                <span>{t("sidebar.skillLibrary")}</span>
                <small>{enabledSkills}</small>
              </button>
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  closeMobileSidebar();
                  openSettings();
                }}
              >
                <Settings size={15} strokeWidth={1.6} />
                <span>{t("sidebar.settings")}</span>
                <small>Ctrl+,</small>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <button
          type="button"
          className="user-profile"
          aria-label={displayProfileName}
          aria-expanded={profileOpen}
          onClick={() => setProfileOpen((current) => !current)}
        >
          <ProfileAvatar />
          <span className="user-name">{displayProfileName}</span>
          <ChevronDown
            className={profileOpen ? "open" : ""}
            size={14}
            strokeWidth={1.6}
            aria-hidden="true"
          />
        </button>
      </div>

      {contextMenu && createPortal(
        <div
          ref={contextMenuRef}
          className="context-menu sidebar-context-menu"
          role="menu"
          style={{
            left: contextMenuPosition?.left ?? contextMenu.x,
            top: contextMenuPosition?.top ?? contextMenu.y,
            visibility: contextMenuPosition ? "visible" : "hidden",
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button type="button" role="menuitem" onClick={() => startRename(contextMenu.session)}>
            <Pencil size={14} strokeWidth={1.55} />
            {t("sidebar.rename")}
          </button>
          <button type="button" role="menuitem" onClick={() => requestSessionAction(contextMenu.session, "archive")}>
            <Archive size={14} strokeWidth={1.55} />
            {t("sidebar.archive")}
          </button>
          <button type="button" role="menuitem" onClick={() => void copySessionId(contextMenu.session)}>
            <Copy size={14} strokeWidth={1.55} />
            {t("sidebar.copySessionId")}
          </button>
          <button
            type="button"
            className="context-menu-delete"
            role="menuitem"
            onClick={() => requestSessionAction(contextMenu.session, "delete")}
          >
            <Trash2 size={14} strokeWidth={1.55} />
            {t("sidebar.delete")}
          </button>
        </div>,
        document.body,
      )}
      {clientDialogOpen && createPortal(
        <ClientProfileDialog
          key="new-client"
          existingClients={availableClientNames}
          onClose={() => setClientDialogOpen(false)}
          onSave={saveClientProfile}
        />,
        document.body,
      )}
      <div
        className="sidebar-resizer"
        role="separator"
        aria-label={t("sidebar.resize")}
        aria-orientation="vertical"
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        aria-valuemax={SIDEBAR_MAX_WIDTH}
        aria-valuenow={sidebarWidth}
        tabIndex={0}
        onDoubleClick={() => saveSidebarWidth(SIDEBAR_DEFAULT_WIDTH)}
        onKeyDown={resizeSidebarWithKeyboard}
        onLostPointerCapture={finishSidebarResize}
        onPointerCancel={endSidebarResize}
        onPointerDown={beginSidebarResize}
        onPointerMove={moveSidebarResize}
        onPointerUp={endSidebarResize}
      />
    </aside>
  );
}
