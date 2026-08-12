import { useEffect, useId } from "react";
import { useI18n } from "../i18n";
import { useCompass } from "../store";

/**
 * App-level confirmation shown instead of the native window.confirm when the
 * user asks to change the workspace while a task is still streaming.
 */
export function WorkspaceChangeDialog(): React.JSX.Element | null {
  const { t } = useI18n();
  const pending = useCompass((state) => state.pendingWorkspaceChange);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    if (!pending) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      // Capture-phase interception keeps Escape exclusive to this dialog
      // instead of also dismissing overlays or settings behind it.
      event.preventDefault();
      event.stopPropagation();
      pending.cancel();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [pending]);

  if (!pending) return null;

  return (
    <div
      className="client-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) pending.cancel();
      }}
    >
      <div
        className="client-delete-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
      >
        <h2 id={titleId}>{t("workspace.changeConfirmTitle")}</h2>
        <p id={bodyId}>{t("workspace.changeConfirmBody")}</p>
        <div className="client-delete-actions">
          <button type="button" className="client-profile-cancel" autoFocus onClick={pending.cancel}>
            {t("common.cancel")}
          </button>
          <button type="button" className="client-delete-confirm" onClick={pending.proceed}>
            {t("workspace.changeConfirmConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
