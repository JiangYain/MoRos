import { useEffect, useState } from "react";

// A native WebContentsView sits above DOM stacking contexts. Hide it while an
// application menu or dialog is open so it cannot cover or capture their input.
export function useNativeBrowserOcclusion(): boolean {
  const [occluded, setOccluded] = useState(false);
  useEffect(() => {
    const selector = '.global-menu-popover, .profile-menu, .popover, .session-search-overlay, .settings-guard-backdrop, [role="dialog"]:not(.wb-shell):not(.wb-dialog)';
    const update = (): void => setOccluded([...document.querySelectorAll(selector)].some((element) => element.getClientRects().length > 0));
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    update();
    return () => observer.disconnect();
  }, []);
  return occluded;
}
