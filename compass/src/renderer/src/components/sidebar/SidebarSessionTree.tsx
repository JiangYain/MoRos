import { useReducedMotion } from "motion/react";
import {
  SESSION_PREVIEW_LIMIT,
  SidebarSessionTreeOverlays,
  SidebarSessionTreeView,
} from "./SidebarSessionTreeViews.tsx";
import { useSessionTreeInteractions } from "./session-tree-interactions.ts";
import { useSessionTreeOrdering } from "./session-tree-ordering.ts";
import { useSessionTreeStore } from "./session-tree-store.ts";
import { useSessionTreeVisibility } from "./session-tree-visibility.ts";

export function SidebarSessionTree(): React.JSX.Element {
  const interactions = useSessionTreeInteractions();
  const store = useSessionTreeStore(interactions);
  const ordering = useSessionTreeOrdering(store.groups, store.ownership);
  const visibility = useSessionTreeVisibility(
    ordering.groups,
    store.activeSessionId,
    SESSION_PREVIEW_LIMIT,
  );
  const reduced = useReducedMotion();

  return (
    <>
      <SidebarSessionTreeView
        actions={store.actions}
        activeSessionId={store.activeSessionId}
        clientMenu={interactions.clientMenu}
        confirmations={interactions.confirmations}
        groups={ordering.groups}
        language={store.language}
        menu={interactions.menu}
        onNewClient={interactions.clientDialog.open}
        ordering={ordering}
        reduced={reduced}
        rename={interactions.rename}
        visibility={visibility}
      />
      <SidebarSessionTreeOverlays
        actions={store.actions}
        activeSessionId={store.activeSessionId}
        availableClients={store.availableClients}
        clientDelete={interactions.clientDelete}
        clientDialog={interactions.clientDialog}
        clientMenu={interactions.clientMenu}
        menu={interactions.menu}
      />
    </>
  );
}
