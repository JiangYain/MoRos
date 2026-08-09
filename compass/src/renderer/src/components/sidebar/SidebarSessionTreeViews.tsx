import type { AppLanguage, UiSessionInfo } from "@shared/types";
import {
  Archive,
  Check,
  ChevronRight,
  Copy,
  Folder,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n.ts";
import { ClientProfileDialog } from "../ClientProfileDialog.tsx";
import { ThreadInlineConfirmation } from "../ThreadInlineConfirmation.tsx";
import type { ThreadConfirmationState } from "../thread-confirmation.ts";
import type {
  ClientDialogInteraction,
  ConfirmationInteraction,
  MenuInteraction,
  RenameInteraction,
} from "./session-tree-interactions.ts";
import type { SessionTreeOrdering } from "./session-tree-ordering.ts";
import {
  type ClientGroup,
  sessionDateTime,
  sessionRelativeAge,
  sessionTime,
  sessionTitle,
} from "./session-tree-model.ts";
import type { SessionTreeSessionActions } from "./session-tree-store.ts";
import type { SessionTreeVisibility } from "./session-tree-visibility.ts";

const ICON_SIZE = 16;
export const SESSION_PREVIEW_LIMIT = 5;

function OpenAIComposeIcon(): React.JSX.Element {
  return (
    <svg
      className="openai-compose-icon"
      width={ICON_SIZE}
      height={ICON_SIZE}
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

interface SessionRowRename {
  active: boolean;
  cancel(): void;
  commit(): void;
  draft: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  setDraft(draft: string): void;
}

interface SessionRowConfirmation {
  cancel(): void;
  confirm(): void;
  state: ThreadConfirmationState | null;
}

interface SessionRowDrag {
  dragging: boolean;
  enabled: boolean;
  end(): void;
  enter(): void;
  start(event: React.DragEvent<HTMLDivElement>): void;
  drop(event: React.DragEvent<HTMLDivElement>): void;
  over(event: React.DragEvent<HTMLDivElement>): void;
}

interface SessionRowMenu {
  expanded: boolean;
  openAtPointer(event: React.MouseEvent): void;
  openFromButton(event: React.MouseEvent<HTMLButtonElement>): void;
}

function SessionRow({
  active,
  confirmation,
  drag,
  language,
  menu,
  onOpen,
  rename,
  session,
}: {
  active: boolean;
  confirmation: SessionRowConfirmation;
  drag: SessionRowDrag;
  language: AppLanguage;
  menu: SessionRowMenu;
  onOpen(): void;
  rename: SessionRowRename;
  session: UiSessionInfo;
}): React.JSX.Element {
  const { t } = useI18n();
  const title = sessionTitle(session, t("common.untitledSession"));
  const relativeAge = sessionRelativeAge(session, t("common.now"));
  const rowClassName = [
    "file-tree-item thread-item-shell",
    active ? " active" : "",
    confirmation.state ? " confirming" : "",
    drag.dragging ? " dragging" : "",
  ].join("");
  const tooltip = `${sessionTime(session, language, t)} · ${relativeAge} · ${title}`;
  return (
    <div
      className={rowClassName}
      draggable={drag.enabled}
      onDragStart={drag.start}
      onDragEnter={drag.enter}
      onDragOver={drag.over}
      onDrop={drag.drop}
      onDragEnd={drag.end}
      onContextMenu={menu.openAtPointer}
    >
      {rename.active ? (
        <div
          className="file-item thread-file-item renaming"
          onBlur={(event) => {
            if (
              !(event.relatedTarget instanceof Node)
              || !event.currentTarget.contains(event.relatedTarget)
            ) {
              rename.cancel();
            }
          }}
        >
          <input
            ref={rename.inputRef}
            className="thread-rename-input"
            value={rename.draft}
            autoFocus
            onChange={(event) => rename.setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") rename.commit();
              if (event.key === "Escape") rename.cancel();
            }}
          />
          <span className="thread-rename-actions">
            <button
              type="button"
              aria-label={t("sidebar.confirmRename")}
              title={t("sidebar.confirmRename")}
              onClick={rename.commit}
            >
              <Check size={12} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              aria-label={t("sidebar.cancelRename")}
              title={t("common.cancel")}
              onClick={rename.cancel}
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
            onClick={onOpen}
            title={tooltip}
          >
            <span className="file-name">{title}</span>
            <time className="thread-relative-time" dateTime={sessionDateTime(session)}>
              {relativeAge}
            </time>
          </button>
          <button
            type="button"
            className="thread-more-button"
            aria-label={`${t("sidebar.moreActions")}: ${sessionTime(session, language, t)}`}
            aria-expanded={menu.expanded}
            title={t("sidebar.moreActions")}
            onClick={menu.openFromButton}
          >
            <MoreHorizontal size={14} strokeWidth={1.65} aria-hidden="true" />
          </button>
        </>
      )}
      <AnimatePresence initial={false}>
        {confirmation.state && (
          <ThreadInlineConfirmation
            key={`${confirmation.state.path}:${confirmation.state.action}`}
            action={confirmation.state.action}
            busy={confirmation.state.busy}
            sessionTitle={title}
            onCancel={confirmation.cancel}
            onConfirm={confirmation.confirm}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

interface ClientGroupViewProps {
  activeSessionId?: string;
  createSession(): void;
  drag: {
    drop(event: React.DragEvent<HTMLDivElement>): void;
    enter(): void;
    leave(event: React.DragEvent<HTMLDivElement>): void;
    over(event: React.DragEvent<HTMLDivElement>): void;
    target: boolean;
  };
  expanded: boolean;
  group: ClientGroup;
  index: number;
  reduced: boolean | null;
  renderSession(session: UiSessionInfo): React.JSX.Element;
  revealed: boolean;
  toggleExpanded(): void;
  toggleRevealed(): void;
}

function ClientGroupView(props: ClientGroupViewProps): React.JSX.Element {
  const { t } = useI18n();
  const visibleSessions = props.revealed
    ? props.group.sessions
    : props.group.sessions.slice(0, SESSION_PREVIEW_LIMIT);
  const hiddenCount = props.group.sessions.length - visibleSessions.length;
  const FolderIcon = props.expanded ? FolderOpen : Folder;
  const clientName = props.group.unassigned ? t("sidebar.unassigned") : props.group.name;
  return (
    <motion.div
      key={props.group.id}
      className="file-tree-item"
      data-active-client={props.group.sessions.some(
        (session) => session.id === props.activeSessionId,
      ) || undefined}
      initial={props.reduced ? false : { opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.24,
        delay: Math.min(props.index * 0.02, 0.14),
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <div
        className={`file-item folder-row${props.drag.target ? " drag-over" : ""}`}
        onDragEnter={props.drag.enter}
        onDragOver={props.drag.over}
        onDragLeave={props.drag.leave}
        onDrop={props.drag.drop}
      >
        <button
          type="button"
          className="file-item-main"
          aria-expanded={props.expanded}
          onClick={props.toggleExpanded}
        >
          <span className="file-icon">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={props.expanded ? "open" : "closed"}
                className="file-icon-glyph"
                initial={props.reduced ? false : { opacity: 0, scale: 0.82 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.82 }}
                transition={props.reduced
                  ? { duration: 0 }
                  : { duration: 0.14, ease: "easeOut" }}
              >
                <FolderIcon size={ICON_SIZE} strokeWidth={1.55} />
              </motion.span>
            </AnimatePresence>
          </span>
          <span className="file-name">{clientName}</span>
          <motion.span
            className="file-chevron"
            animate={{ rotate: props.expanded ? 90 : 0 }}
            transition={props.reduced
              ? { duration: 0 }
              : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <ChevronRight size={ICON_SIZE} strokeWidth={1.6} aria-hidden="true" />
          </motion.span>
        </button>
        <button
          type="button"
          className="file-action-btn"
          title={t("sidebar.newConversationFor", { name: clientName })}
          aria-label={t("sidebar.newConversationFor", { name: clientName })}
          onClick={props.createSession}
        >
          <OpenAIComposeIcon />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {props.expanded && (
          <motion.div
            key="client-threads"
            className="file-children"
            initial={props.reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={props.reduced
              ? { duration: 0 }
              : {
                  height: { duration: 0.26, ease: [0.2, 0, 0, 1] },
                  opacity: { duration: 0.12, ease: "easeOut" },
                }}
          >
            {props.group.sessions.length === 0 && (
              <div className="client-empty-label">{t("sidebar.noConversations")}</div>
            )}
            {visibleSessions.map(props.renderSession)}
            {props.group.sessions.length > SESSION_PREVIEW_LIMIT && (
              <button
                type="button"
                className="show-more-sessions"
                aria-label={props.revealed
                  ? t("sidebar.showLess")
                  : `${t("sidebar.showMore")} (${hiddenCount})`}
                onClick={props.toggleRevealed}
              >
                <span>{t(props.revealed ? "sidebar.showLess" : "sidebar.showMore")}</span>
                {!props.revealed && (
                  <span className="show-more-sessions-count" aria-hidden="true">
                    {hiddenCount}
                  </span>
                )}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

type SessionTreeViewActions = Pick<
  SessionTreeSessionActions,
  "commitRename" | "confirm" | "create" | "open"
>;

interface SessionTreeViewWorkflow {
  actions: SessionTreeViewActions;
  confirmations: ConfirmationInteraction;
  menu: MenuInteraction;
  ordering: SessionTreeOrdering;
  rename: RenameInteraction;
}

function SessionTreeRowController({
  activeSessionId,
  group,
  language,
  session,
  workflow,
}: {
  activeSessionId?: string;
  group: ClientGroup;
  language: AppLanguage;
  session: UiSessionInfo;
  workflow: SessionTreeViewWorkflow;
}): React.JSX.Element {
  const active = activeSessionId === session.id;
  const renaming = workflow.rename.state?.path === session.path;
  const confirmation = workflow.confirmations.items[session.path] ?? null;
  const dragged = workflow.ordering.drag.dragged;
  return (
    <SessionRow
      session={session}
      active={active}
      language={language}
      onOpen={() => workflow.actions.open(session, active)}
      rename={{
        active: renaming,
        draft: renaming ? workflow.rename.state?.draft ?? "" : "",
        inputRef: workflow.rename.inputRef,
        setDraft: workflow.rename.setDraft,
        cancel: workflow.rename.cancel,
        commit: () => workflow.actions.commitRename(session.path),
      }}
      confirmation={{
        state: confirmation,
        cancel: () => {
          if (confirmation) workflow.confirmations.clear(confirmation);
        },
        confirm: () => {
          if (confirmation) workflow.actions.confirm(confirmation);
        },
      }}
      drag={{
        dragging: dragged?.sessionId === session.id,
        enabled: !renaming && !confirmation,
        start: (event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", session.id);
          workflow.ordering.startDrag({ sessionId: session.id, clientId: group.id });
        },
        enter: () => {
          if (!dragged) return;
          workflow.ordering.enterClient(group.id);
          if (dragged.clientId === group.id) {
            workflow.ordering.reorder(group, dragged.sessionId, session.id);
          }
        },
        over: (event) => {
          if (!dragged) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        },
        drop: (event) => {
          event.preventDefault();
          workflow.ordering.drop(group, session.id);
        },
        end: workflow.ordering.finishDrag,
      }}
      menu={{
        expanded: workflow.menu.state?.session.path === session.path,
        openFromButton: (event) => {
          event.preventDefault();
          event.stopPropagation();
          const bounds = event.currentTarget.getBoundingClientRect();
          workflow.menu.open({
            x: bounds.right,
            y: bounds.bottom + 4,
            session,
            alignRight: true,
          });
        },
        openAtPointer: (event) => {
          event.preventDefault();
          event.stopPropagation();
          workflow.menu.open({
            x: event.clientX,
            y: event.clientY,
            session,
            alignRight: false,
          });
        },
      }}
    />
  );
}

function SessionTreeGroupController({
  activeSessionId,
  group,
  index,
  language,
  reduced,
  visibility,
  workflow,
}: {
  activeSessionId?: string;
  group: ClientGroup;
  index: number;
  language: AppLanguage;
  reduced: boolean | null;
  visibility: SessionTreeVisibility;
  workflow: SessionTreeViewWorkflow;
}): React.JSX.Element {
  const expanded = !visibility.state.collapsedClients[group.id];
  const revealed = Boolean(visibility.state.revealedClients[group.id]);
  return (
    <ClientGroupView
      group={group}
      index={index}
      activeSessionId={activeSessionId}
      reduced={reduced}
      expanded={expanded}
      revealed={revealed}
      toggleExpanded={() => visibility.toggleClient(group.id)}
      toggleRevealed={() => visibility.toggleRevealed(group.id)}
      createSession={() => workflow.actions.create(group)}
      renderSession={(session) => (
        <SessionTreeRowController
          key={session.path}
          activeSessionId={activeSessionId}
          group={group}
          language={language}
          session={session}
          workflow={workflow}
        />
      )}
      drag={{
        target: workflow.ordering.drag.overClientId === group.id,
        enter: () => {
          if (workflow.ordering.drag.dragged) workflow.ordering.enterClient(group.id);
        },
        over: (event) => {
          if (!workflow.ordering.drag.dragged) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        },
        leave: (event) => {
          const nextTarget = event.relatedTarget;
          if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
            workflow.ordering.leaveClient(group.id);
          }
        },
        drop: (event) => {
          event.preventDefault();
          workflow.ordering.drop(group);
        },
      }}
    />
  );
}

interface SidebarSessionTreeViewProps {
  actions: SessionTreeViewActions;
  activeSessionId?: string;
  confirmations: ConfirmationInteraction;
  groups: ClientGroup[];
  language: AppLanguage;
  menu: MenuInteraction;
  onNewClient(): void;
  ordering: SessionTreeOrdering;
  reduced: boolean | null;
  rename: RenameInteraction;
  visibility: SessionTreeVisibility;
}

export function SidebarSessionTreeView({
  actions,
  activeSessionId,
  confirmations,
  groups,
  language,
  menu,
  ordering,
  reduced,
  rename,
  visibility,
  onNewClient,
}: SidebarSessionTreeViewProps): React.JSX.Element {
  const { t } = useI18n();
  if (!groups.length) {
    return (
      <div className="file-tree">
        <div className="empty-state">{t("sidebar.empty")}</div>
      </div>
    );
  }
  const workflow: SessionTreeViewWorkflow = {
    actions,
    confirmations,
    menu,
    ordering,
    rename,
  };
  return (
    <div className="file-tree">
      <div className="file-section">
        <div className="file-section-header">
          <button
            type="button"
            className="file-section-header-main"
            aria-expanded={!visibility.state.clientsCollapsed}
            onClick={visibility.toggleSection}
          >
            <span className="file-section-title">{t("sidebar.clients")}</span>
            <span className="file-section-header-right">
              <span className="file-section-count">{groups.length}</span>
              <motion.span
                className="file-section-toggle file-chevron"
                animate={{ rotate: visibility.state.clientsCollapsed ? 0 : 90 }}
                transition={reduced
                  ? { duration: 0 }
                  : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              >
                <ChevronRight size={ICON_SIZE} strokeWidth={1.6} aria-hidden="true" />
              </motion.span>
            </span>
          </button>
          <button
            type="button"
            className="file-section-add"
            aria-label={t("sidebar.newClient")}
            title={t("sidebar.newClient")}
            onClick={onNewClient}
          >
            <Plus size={ICON_SIZE} strokeWidth={1.6} />
          </button>
        </div>
        <AnimatePresence initial={false}>
          {!visibility.state.clientsCollapsed && (
            <motion.div
              key="client-section-content"
              className="file-section-content"
              initial={reduced ? false : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={reduced
                ? { duration: 0 }
                : {
                    height: { duration: 0.26, ease: [0.2, 0, 0, 1] },
                    opacity: { duration: 0.12, ease: "easeOut" },
                  }}
            >
              {groups.map((group, index) => (
                <SessionTreeGroupController
                  key={group.id}
                  activeSessionId={activeSessionId}
                  group={group}
                  index={index}
                  language={language}
                  reduced={reduced}
                  visibility={visibility}
                  workflow={workflow}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function SidebarSessionTreeOverlays({
  actions,
  availableClients,
  clientDialog,
  menu,
}: {
  actions: Pick<SessionTreeSessionActions, "beginRename" | "copySessionId" | "requestConfirmation" | "saveClient">;
  availableClients: string[];
  clientDialog: ClientDialogInteraction;
  menu: MenuInteraction;
}): React.JSX.Element {
  const { t } = useI18n();
  const menuState = menu.state;
  return (
    <>
      {menuState && createPortal(
        <div
          ref={menu.ref}
          className="context-menu sidebar-context-menu"
          role="menu"
          style={{
            left: menu.position?.left ?? menuState.x,
            top: menu.position?.top ?? menuState.y,
            visibility: menu.position ? "visible" : "hidden",
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => actions.beginRename(menuState.session)}
          >
            <Pencil size={14} strokeWidth={1.55} />
            {t("sidebar.rename")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => actions.requestConfirmation(menuState.session, "archive")}
          >
            <Archive size={14} strokeWidth={1.55} />
            {t("sidebar.archive")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => actions.copySessionId(menuState.session)}
          >
            <Copy size={14} strokeWidth={1.55} />
            {t("sidebar.copySessionId")}
          </button>
          <button
            type="button"
            className="context-menu-delete"
            role="menuitem"
            onClick={() => actions.requestConfirmation(menuState.session, "delete")}
          >
            <Trash2 size={14} strokeWidth={1.55} />
            {t("sidebar.delete")}
          </button>
        </div>,
        document.body,
      )}
      {clientDialog.visible && createPortal(
        <ClientProfileDialog
          key="new-client"
          existingClients={availableClients}
          onClose={clientDialog.close}
          onSave={actions.saveClient}
        />,
        document.body,
      )}
    </>
  );
}
