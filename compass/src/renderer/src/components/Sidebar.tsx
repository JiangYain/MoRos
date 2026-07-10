import type { UiSessionInfo } from "@shared/types";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Copy,
  Folder,
  FolderOpen,
  Gauge,
  Pencil,
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
  session: UiSessionInfo;
}

const PROFILE_NAME = "ChordJiang";
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

function cleanClientName(value: string): string {
  return value
    .replace(/^[\s"'“”‘’`]+|[\s"'“”‘’`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

function isPlausibleClientName(value: string): boolean {
  return Boolean(value) && !value.includes("```") && !/[<>]/.test(value);
}

function inferClient(session: UiSessionInfo): Pick<ClientGroup, "id" | "name" | "unassigned"> {
  const source = `${session.name ?? ""}\n${session.firstMessage ?? ""}`;
  for (const pattern of CLIENT_PATTERNS) {
    const match = pattern.exec(source);
    const clientName = match?.[1] ? cleanClientName(match[1]) : "";
    if (isPlausibleClientName(clientName)) {
      return {
        id: `client:${clientName.toLocaleLowerCase("zh-CN")}`,
        name: clientName,
        unassigned: false,
      };
    }
  }
  return UNASSIGNED_CLIENT;
}

function groupSessionsByClient(sessions: UiSessionInfo[]): ClientGroup[] {
  const groups = new Map<string, ClientGroup>();
  for (const session of sessions) {
    const client = inferClient(session);
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

function filterClientGroups(groups: ClientGroup[], query: string): ClientGroup[] {
  const normalized = query.trim().toLocaleLowerCase("zh-CN");
  if (!normalized) return groups;
  return groups.flatMap((group) => {
    if (group.name.toLocaleLowerCase("zh-CN").includes(normalized)) return [group];
    const sessions = group.sessions.filter((session) =>
      `${sessionTitle(session)}\n${session.firstMessage}`
        .toLocaleLowerCase("zh-CN")
        .includes(normalized),
    );
    return sessions.length > 0 ? [{ ...group, sessions }] : [];
  });
}

export function Sidebar(): React.JSX.Element {
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
  const setPanel = useCompass((state) => state.setPanel);
  const sidebarOpen = useCompass((state) => state.sidebarOpen);
  const setSidebarOpen = useCompass((state) => state.setSidebarOpen);
  const reduced = useReducedMotion();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const [collapsedClients, setCollapsedClients] = useState<Record<string, boolean>>({});
  const [clientsCollapsed, setClientsCollapsed] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const clientGroups = useMemo(() => groupSessionsByClient(sessions), [sessions]);
  const visibleClientGroups = useMemo(
    () => filterClientGroups(clientGroups, searchQuery),
    [clientGroups, searchQuery],
  );
  const activeSessionId = stats?.sessionId;
  const enabledSkills = skills.filter((skill) => skill.enabled).length;
  const contextPercent = stats?.contextPercent == null ? null : Math.round(stats.contextPercent);

  useEffect(() => {
    if (showSearch) searchInputRef.current?.focus();
  }, [showSearch]);

  useEffect(() => {
    const closeMenus = (event: MouseEvent): void => {
      setContextMenu(null);
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };
    const closeMenusWithKeyboard = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      setContextMenu(null);
      setProfileOpen(false);
    };
    document.addEventListener("mousedown", closeMenus);
    document.addEventListener("keydown", closeMenusWithKeyboard);
    return () => {
      document.removeEventListener("mousedown", closeMenus);
      document.removeEventListener("keydown", closeMenusWithKeyboard);
    };
  }, []);

  const toggleClient = (clientId: string): void => {
    setCollapsedClients((current) => ({ ...current, [clientId]: !current[clientId] }));
  };

  const createThreadForClient = async (group: ClientGroup): Promise<void> => {
    setSidebarOpen(false);
    await newSession();
    if (!group.unassigned) seedComposer(`顾客：${group.name}\n`);
  };

  const openThreadContextMenu = (event: React.MouseEvent, session: UiSessionInfo): void => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 188),
      y: Math.min(event.clientY, window.innerHeight - 178),
      session,
    });
  };

  const copySessionId = async (session: UiSessionInfo): Promise<void> => {
    try {
      await navigator.clipboard.writeText(session.id);
    } catch {
      setError("复制 Session ID 失败");
    }
    setContextMenu(null);
  };

  const startRename = (session: UiSessionInfo): void => {
    setRenamingPath(session.path);
    setRenameDraft(sessionTitle(session));
    setContextMenu(null);
  };

  const commitRename = (path: string): void => {
    const nextName = renameDraft.trim();
    setRenamingPath(null);
    if (nextName) void renameSession(path, nextName);
  };

  const removeSession = (session: UiSessionInfo): void => {
    setContextMenu(null);
    if (window.confirm(`删除会话“${sessionTitle(session)}”？此操作无法撤销。`)) {
      void deleteSession(session.path);
    }
  };

  const archiveSelectedSession = (session: UiSessionInfo): void => {
    setContextMenu(null);
    if (window.confirm(`归档会话“${sessionTitle(session)}”？可从会话目录的 archive 文件夹中找回。`)) {
      void archiveSession(session.path);
    }
  };

  return (
    <aside className={`sidebar${sidebarOpen ? " mobile-open" : ""}`}>
      <nav className="sidebar-nav" aria-label="Compass navigation">
        <button
          type="button"
          className="sidebar-nav-item"
          onClick={() => {
            setSidebarOpen(false);
            void newSession();
          }}
        >
          <SquarePen size={16} strokeWidth={1.65} aria-hidden="true" />
          <span>新对话</span>
        </button>
        <button
          type="button"
          className={`sidebar-nav-item${showSearch ? " active" : ""}`}
          aria-expanded={showSearch}
          onClick={() => {
            setShowSearch((current) => {
              if (current) setSearchQuery("");
              return !current;
            });
          }}
        >
          <Search size={16} strokeWidth={1.65} aria-hidden="true" />
          <span>搜索</span>
        </button>
        <button
          type="button"
          className="sidebar-nav-item"
          onClick={() => {
            setSidebarOpen(false);
            setPanel("skills");
          }}
        >
          <Puzzle size={16} strokeWidth={1.65} aria-hidden="true" />
          <span>技能</span>
          <span className="nav-count">{enabledSkills}</span>
        </button>
      </nav>

      <AnimatePresence initial={false}>
        {showSearch && (
          <motion.div
            className="sidebar-search"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <Search size={14} strokeWidth={1.6} aria-hidden="true" />
            <input
              ref={searchInputRef}
              value={searchQuery}
              placeholder="搜索客户或会话"
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            {searchQuery && (
              <button type="button" aria-label="清空搜索" onClick={() => setSearchQuery("")}>
                <X size={13} strokeWidth={1.7} />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="file-tree">
        {sessions.length === 0 ? (
          <div className="empty-state">开始第一次验配对话后，会话会自动归入客户档案。</div>
        ) : visibleClientGroups.length === 0 ? (
          <div className="empty-state">没有匹配的客户或会话。</div>
        ) : (
          <div className="file-section">
            <button
              type="button"
              className="file-section-header"
              onClick={() => setClientsCollapsed((current) => !current)}
            >
              <span className="file-section-title">客户档案</span>
              <span className="file-section-header-right">
                <span className="file-section-count">{visibleClientGroups.length}</span>
                {clientsCollapsed ? (
                  <ChevronRight size={13} strokeWidth={1.6} />
                ) : (
                  <ChevronDown size={13} strokeWidth={1.6} />
                )}
              </span>
            </button>

            {!clientsCollapsed && (
              <div className="file-section-content">
                {visibleClientGroups.map((group, index) => {
                  const activeClient = group.sessions.some(
                    (session) => session.id === activeSessionId,
                  );
                  const expanded = activeClient || !collapsedClients[group.id];
                  const FolderIcon = expanded ? FolderOpen : Folder;
                  return (
                    <motion.div
                      key={group.id}
                      className="file-tree-item"
                      initial={reduced ? false : { opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.24,
                        delay: Math.min(index * 0.02, 0.14),
                        ease: [0.22, 1, 0.36, 1],
                      }}
                    >
                      <div className={`file-item folder-row${activeClient ? " active" : ""}`}>
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
                          {group.sessions.map((session) => {
                            const active = activeSessionId === session.id;
                            const renaming = renamingPath === session.path;
                            return (
                              <div className="file-tree-item" key={session.path}>
                                {renaming ? (
                                  <div className="file-item thread-file-item renaming">
                                    <input
                                      className="thread-rename-input"
                                      value={renameDraft}
                                      autoFocus
                                      onChange={(event) => setRenameDraft(event.target.value)}
                                      onBlur={() => commitRename(session.path)}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") commitRename(session.path);
                                        if (event.key === "Escape") setRenamingPath(null);
                                      }}
                                    />
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    className={`file-item thread-file-item${active ? " active" : ""}`}
                                    onClick={() => {
                                      setSidebarOpen(false);
                                      void openSession(session.path);
                                    }}
                                    onContextMenu={(event) => openThreadContextMenu(event, session)}
                                    title={sessionTitle(session)}
                                  >
                                    <span className="file-name">{sessionTitle(session)}</span>
                                  </button>
                                )}
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
              <div className="profile-menu-head">
                <span className="profile-avatar large">CJ</span>
                <span>
                  <b>{PROFILE_NAME}</b>
                  <small>Local operator</small>
                </span>
              </div>
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
                  setSidebarOpen(false);
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
                  setSidebarOpen(false);
                  setPanel("skills");
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
                  setSidebarOpen(false);
                  setPanel("settings");
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
          <span className="profile-avatar">CJ</span>
          <span className="user-name">{PROFILE_NAME}</span>
          <ChevronDown
            className={profileOpen ? "open" : ""}
            size={14}
            strokeWidth={1.6}
            aria-hidden="true"
          />
        </button>
      </div>

      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={() => startRename(contextMenu.session)}>
            <Pencil size={14} strokeWidth={1.55} />
            重命名
          </button>
          <button type="button" onClick={() => archiveSelectedSession(contextMenu.session)}>
            <Archive size={14} strokeWidth={1.55} />
            归档
          </button>
          <button type="button" onClick={() => removeSession(contextMenu.session)}>
            <Trash2 size={14} strokeWidth={1.55} />
            删除
          </button>
          <button type="button" onClick={() => void copySessionId(contextMenu.session)}>
            <Copy size={14} strokeWidth={1.55} />
            复制 Session ID
          </button>
        </div>
      )}
    </aside>
  );
}
