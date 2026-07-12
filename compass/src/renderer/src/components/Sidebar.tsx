import type { UiSessionInfo } from "@shared/types";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Folder,
  FolderOpen,
  Gauge,
  Link2,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
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
import { useCompass } from "../store";
import { ClientAssignmentDialog } from "./ClientAssignmentDialog";
import { ClientProfileDialog } from "./ClientProfileDialog";
import { ProfileAvatar } from "./ProfileAvatar";
import { SessionSearchOverlay, type SessionSearchEntry } from "./SessionSearchOverlay";
import {
  ThreadInlineConfirmation,
  type ThreadConfirmationAction,
} from "./ThreadInlineConfirmation";
import {
  clampSidebarWidth,
  parseSidebarWidth,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from "./sidebar-width";
import {
  addClientProfile,
  assignSessionToClient,
  CLIENT_REGISTRY_STORAGE_KEY,
  type ClientProfileDraft,
  type ClientRegistry,
  normalizeClientName,
  parseClientRegistry,
  unassignSession,
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

interface ClientDialogState {
  session?: UiSessionInfo;
}

interface SessionConfirmationState {
  path: string;
  action: ThreadConfirmationAction;
  busy: boolean;
}

interface SidebarResizeState {
  pointerId: number;
  startX: number;
  startWidth: number;
  currentWidth: number;
}

interface SidebarProps {
  canNavigateBack: boolean;
  canNavigateForward: boolean;
  onNavigateBack(): void;
  onNavigateForward(): void;
}

const PROFILE_NAME = "ChordJiang";
const SIDEBAR_WIDTH_STORAGE_KEY = "compass.sidebar.width.v1";
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

function sessionTitle(session: UiSessionInfo): string {
  return session.name?.trim() || session.firstMessage.trim() || "未命名会话";
}

function normalizedSessionDate(value: number): Date {
  return new Date(value > 0 && value < 1_000_000_000_000 ? value * 1_000 : value);
}

function sessionTime(session: UiSessionInfo): string {
  const date = normalizedSessionDate(session.createdAt || session.modifiedAt);
  if (Number.isNaN(date.getTime())) return "时间未知";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const time = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  if (startOfDate === startOfToday) return `今天 ${time}`;
  if (startOfDate === startOfToday - 86_400_000) return `昨天 ${time}`;
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
  }
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${time}`;
}

function sessionRelativeAge(session: UiSessionInfo, now = Date.now()): string {
  const date = normalizedSessionDate(session.createdAt || session.modifiedAt);
  if (Number.isNaN(date.getTime())) return "—";
  const elapsed = Math.max(0, now - date.getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "now";
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

export function Sidebar({
  canNavigateBack,
  canNavigateForward,
  onNavigateBack,
  onNavigateForward,
}: SidebarProps): React.JSX.Element {
  const sessions = useCompass((state) => state.sessions);
  const stats = useCompass((state) => state.stats);
  const settings = useCompass((state) => state.settings);
  const skills = useCompass((state) => state.skills);
  const newSession = useCompass((state) => state.newSession);
  const openSession = useCompass((state) => state.openSession);
  const renameSession = useCompass((state) => state.renameSession);
  const deleteSession = useCompass((state) => state.deleteSession);
  const archiveSession = useCompass((state) => state.archiveSession);
  const seedComposer = useCompass((state) => state.seedComposer);
  const setError = useCompass((state) => state.setError);
  const openSettings = useCompass((state) => state.openSettings);
  const sidebarOpen = useCompass((state) => state.sidebarOpen);
  const setSidebarOpen = useCompass((state) => state.setSidebarOpen);
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
  const [clientDialog, setClientDialog] = useState<ClientDialogState | null>(null);
  const [sessionConfirmation, setSessionConfirmation] = useState<SessionConfirmationState | null>(null);
  const [clientRegistry, setClientRegistry] = useState<ClientRegistry>(() => {
    try {
      return parseClientRegistry(window.localStorage.getItem(CLIENT_REGISTRY_STORAGE_KEY));
    } catch {
      return parseClientRegistry(null);
    }
  });
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const clientGroups = useMemo(
    () => groupSessionsByClient(sessions, clientRegistry),
    [clientRegistry, sessions],
  );
  const activeSessionId = stats?.sessionId;
  const searchEntries = useMemo<SessionSearchEntry[]>(
    () => sessions.map((session) => {
      const client = inferClient(session, clientRegistry);
      return {
        id: session.id,
        path: session.path,
        title: sessionTitle(session),
        time: sessionTime(session),
        client: client.name,
        active: session.id === activeSessionId,
      };
    }),
    [activeSessionId, clientRegistry, sessions],
  );
  const enabledSkills = skills.filter((skill) => skill.enabled).length;
  const contextPercent = stats?.contextPercent == null ? null : Math.round(stats.contextPercent);

  useEffect(() => {
    try {
      window.localStorage.setItem(CLIENT_REGISTRY_STORAGE_KEY, JSON.stringify(clientRegistry));
    } catch {
      // Manual grouping remains available for the current session when storage is unavailable.
    }
  }, [clientRegistry]);

  useEffect(() => {
    setSessionConfirmation((current) => current?.busy ? current : null);
  }, [activeSessionId]);

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
      setSessionConfirmation((current) => current?.busy ? current : null);
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
    await newSession();
    if (!group.unassigned) seedComposer(`顾客：${group.name}\n`);
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
    setSessionConfirmation(null);
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
      setError("复制 Session ID 失败");
    }
    closeThreadMenu();
  };

  const startRename = (session: UiSessionInfo): void => {
    setRenamingPath(session.path);
    setRenameDraft(sessionTitle(session));
    closeThreadMenu();
  };

  const commitRename = (path: string): void => {
    const nextName = renameDraft.trim();
    if (!nextName) {
      setError("会话名称不能为空。");
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

  const openClientDialog = (session?: UiSessionInfo): void => {
    closeThreadMenu();
    setClientDialog({ session });
  };

  const saveClient = (name: string): void => {
    const normalized = normalizeClientName(name);
    if (!normalized) return;
    const session = clientDialog?.session;
    if (!session) return;
    setClientRegistry((current) => assignSessionToClient(current, session.id, normalized));
    setClientDialog(null);
  };

  const saveClientProfile = (profile: ClientProfileDraft): void => {
    setClientRegistry((current) => addClientProfile(current, profile));
    setClientDialog(null);
  };

  const clearClientAssignment = (): void => {
    const session = clientDialog?.session;
    if (!session) return;
    setClientRegistry((current) => unassignSession(current, session.id));
    setClientDialog(null);
  };

  const requestSessionAction = (
    session: UiSessionInfo,
    action: SessionConfirmationState["action"],
  ): void => {
    closeThreadMenu();
    setSessionConfirmation({ path: session.path, action, busy: false });
  };

  const confirmSessionAction = async (confirmation: SessionConfirmationState): Promise<void> => {
    if (confirmation.busy) return;
    setSessionConfirmation((current) => {
      if (
        !current
        || current.path !== confirmation.path
        || current.action !== confirmation.action
        || current.busy
      ) return current;
      return { ...current, busy: true };
    });
    if (confirmation.action === "delete") await deleteSession(confirmation.path);
    else await archiveSession(confirmation.path);
    setSessionConfirmation((current) => current?.path === confirmation.path ? null : current);
  };

  const dialogSession = clientDialog?.session;
  const dialogClient = dialogSession ? inferClient(dialogSession, clientRegistry) : undefined;
  const availableClientNames = clientGroups
    .filter((group) => !group.unassigned)
    .map((group) => group.name);

  return (
    <aside
      className={`sidebar${sidebarOpen ? " mobile-open" : " collapsed"}${sidebarResizing ? " resizing" : ""}`}
      style={{ "--sidebar-w": `${sidebarWidth}px` } as React.CSSProperties}
    >
      <div className="sidebar-header-controls">
        <button
          type="button"
          className="sidebar-header-button sidebar-collapse-button"
          aria-label={sidebarOpen ? "折叠侧边栏" : "展开侧边栏"}
          aria-expanded={sidebarOpen}
          title={sidebarOpen ? "折叠侧边栏" : "展开侧边栏"}
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? (
            <PanelLeftClose size={14} strokeWidth={1.6} aria-hidden="true" />
          ) : (
            <PanelLeftOpen size={14} strokeWidth={1.6} aria-hidden="true" />
          )}
        </button>
        <div className="sidebar-history-controls" aria-label="Navigation history">
          <button
            type="button"
            className="sidebar-header-button"
            aria-label="后退"
            title="后退"
            disabled={!canNavigateBack}
            onClick={onNavigateBack}
          >
            <ArrowLeft size={14} strokeWidth={1.6} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="sidebar-header-button"
            aria-label="前进"
            title="前进"
            disabled={!canNavigateForward}
            onClick={onNavigateForward}
          >
            <ArrowRight size={14} strokeWidth={1.6} aria-hidden="true" />
          </button>
        </div>
      </div>

      <SessionSearchOverlay
        entries={searchEntries}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={(entry) => {
          setSearchOpen(false);
          if (!entry.active) void openSession(entry.path);
        }}
      />

      <nav className="sidebar-nav" aria-label="Compass navigation">
        <button
          type="button"
          className="sidebar-nav-item"
          onClick={() => {
            closeMobileSidebar();
            void newSession();
          }}
        >
          <SquarePen size={16} strokeWidth={1.65} aria-hidden="true" />
          <span>New</span>
        </button>
        <button
          type="button"
          className={`sidebar-nav-item${searchOpen ? " active" : ""}`}
          aria-label="Search"
          aria-expanded={searchOpen}
          aria-controls="session-search-dialog"
          onClick={() => {
            setSearchOpen((current) => !current);
            closeMobileSidebar();
          }}
        >
          <Search size={16} strokeWidth={1.65} aria-hidden="true" />
          <span>Search</span>
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
          <span>技能</span>
          <span className="nav-count">{enabledSkills}</span>
        </button>
      </nav>

      <div className="file-tree">
        {clientGroups.length === 0 ? (
          <div className="empty-state">开始第一次验配对话后，会话会自动归入客户档案。</div>
        ) : (
          <div className="file-section">
            <div className="file-section-header">
              <button
                type="button"
                className="file-section-header-main"
                aria-expanded={!clientsCollapsed}
                onClick={() => setClientsCollapsed((current) => !current)}
              >
                <span className="file-section-title">客户档案</span>
                <span className="file-section-header-right">
                  <span className="file-section-count">{clientGroups.length}</span>
                  {clientsCollapsed ? (
                    <ChevronRight size={13} strokeWidth={1.6} />
                  ) : (
                    <ChevronDown size={13} strokeWidth={1.6} />
                  )}
                </span>
              </button>
              <button
                type="button"
                className="file-section-add"
                aria-label="新建客户档案"
                title="新建客户档案"
                onClick={() => openClientDialog()}
              >
                <Plus size={13} strokeWidth={1.65} />
              </button>
            </div>

            {!clientsCollapsed && (
              <div className="file-section-content">
                {clientGroups.map((group, index) => {
                  const activeClient = group.sessions.some(
                    (session) => session.id === activeSessionId,
                  );
                  const expanded = !collapsedClients[group.id];
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
                      <div className="file-item folder-row">
                        <button
                          type="button"
                          className="file-item-main"
                          aria-expanded={expanded}
                          onClick={() => toggleClient(group.id)}
                        >
                          <span className="file-icon">
                            <FolderIcon size={14} strokeWidth={1.55} />
                          </span>
                          <span className="file-name">{group.name}</span>
                          {expanded ? (
                            <ChevronDown size={12} strokeWidth={1.55} />
                          ) : (
                            <ChevronRight size={12} strokeWidth={1.55} />
                          )}
                        </button>
                        <button
                          type="button"
                          className="file-action-btn"
                          title={`新对话并预填客户：${group.name}`}
                          aria-label={`新对话并预填客户：${group.name}`}
                          onClick={() => void createThreadForClient(group)}
                        >
                          <SquarePen size={13} strokeWidth={1.6} />
                        </button>
                      </div>

                      {expanded && (
                        <div className="file-children">
                          {group.sessions.length === 0 && (
                            <div className="client-empty-label">暂无会话</div>
                          )}
                          {group.sessions.map((session) => {
                            const active = activeSessionId === session.id;
                            const renaming = renamingPath === session.path;
                            const confirmation = sessionConfirmation?.path === session.path
                              ? sessionConfirmation
                              : null;
                            const relativeAge = sessionRelativeAge(session);
                            return (
                              <div
                                className={`file-tree-item thread-item-shell${active ? " active" : ""}${confirmation ? " confirming" : ""}`}
                                key={session.path}
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
                                        aria-label="确认重命名"
                                        title="确认"
                                        onClick={() => commitRename(session.path)}
                                      >
                                        <Check size={12} strokeWidth={1.8} />
                                      </button>
                                      <button
                                        type="button"
                                        aria-label="取消重命名"
                                        title="取消"
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
                                        if (!active) void openSession(session.path);
                                      }}
                                      title={`${sessionTime(session)} · ${relativeAge} · ${sessionTitle(session)}`}
                                    >
                                      <span className="file-name">{sessionTitle(session)}</span>
                                      <time className="thread-relative-time" dateTime={sessionDateTime(session)}>
                                        {relativeAge}
                                      </time>
                                    </button>
                                    <button
                                      type="button"
                                      className="thread-more-button"
                                      aria-label={`会话操作：${sessionTime(session)}`}
                                      aria-expanded={contextMenu?.session.path === session.path}
                                      title="更多操作"
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
                                      onCancel={() => setSessionConfirmation(null)}
                                      onConfirm={() => confirmSessionAction(confirmation)}
                                    />
                                  )}
                                </AnimatePresence>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
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
                aria-label="打开个人资料"
                onClick={() => {
                  setProfileOpen(false);
                  closeMobileSidebar();
                  openSettings("profile");
                }}
              >
                <ProfileAvatar className="large" />
                <span>
                  <b>{PROFILE_NAME}</b>
                  <small>Local operator</small>
                </span>
              </button>
              <div className="profile-menu-rule" />
              <div className="profile-usage">
                <Gauge size={15} strokeWidth={1.6} />
                <span>上下文用量</span>
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
                <span>打开工作区</span>
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
                <span>技能库</span>
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
                <span>设置</span>
                <small>Ctrl+,</small>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <button
          type="button"
          className="user-profile"
          aria-expanded={profileOpen}
          onClick={() => setProfileOpen((current) => !current)}
        >
          <ProfileAvatar />
          <span className="user-name">{PROFILE_NAME}</span>
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
          <button type="button" role="menuitem" onClick={() => openClientDialog(contextMenu.session)}>
            <Link2 size={14} strokeWidth={1.55} />
            关联到客户…
          </button>
          <div className="context-menu-rule" />
          <button type="button" role="menuitem" onClick={() => startRename(contextMenu.session)}>
            <Pencil size={14} strokeWidth={1.55} />
            重命名
          </button>
          <button type="button" role="menuitem" onClick={() => requestSessionAction(contextMenu.session, "archive")}>
            <Archive size={14} strokeWidth={1.55} />
            归档
          </button>
          <button type="button" role="menuitem" onClick={() => requestSessionAction(contextMenu.session, "delete")}>
            <Trash2 size={14} strokeWidth={1.55} />
            删除
          </button>
          <button type="button" role="menuitem" onClick={() => void copySessionId(contextMenu.session)}>
            <Copy size={14} strokeWidth={1.55} />
            复制 Session ID
          </button>
        </div>,
        document.body,
      )}
      {clientDialog && createPortal(
        dialogSession ? (
          <ClientAssignmentDialog
            key={dialogSession.id}
            clients={availableClientNames}
            currentClient={dialogClient?.unassigned ? undefined : dialogClient?.name}
            sessionTitle={sessionTitle(dialogSession)}
            onClose={() => setClientDialog(null)}
            onSave={saveClient}
            onUnassign={!dialogClient?.unassigned ? clearClientAssignment : undefined}
          />
        ) : (
          <ClientProfileDialog
            key="new-client"
            existingClients={availableClientNames}
            onClose={() => setClientDialog(null)}
            onSave={saveClientProfile}
          />
        ),
        document.body,
      )}
      <div
        className="sidebar-resizer"
        role="separator"
        aria-label="调整侧边栏宽度"
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
