import { MessageSquare, Search, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../i18n";
import { moveListSelection } from "./list-keyboard-navigation";

export interface SessionSearchEntry {
  id: string;
  path: string;
  title: string;
  time: string;
  client: string;
  active: boolean;
}

interface SessionSearchOverlayProps {
  entries: SessionSearchEntry[];
  open: boolean;
  onClose(): void;
  onSelect(entry: SessionSearchEntry): void;
}

export function SessionSearchOverlay({
  entries,
  open,
  onClose,
  onSelect,
}: SessionSearchOverlayProps): React.JSX.Element | null {
  const { language, t } = useI18n();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const reduced = useReducedMotion();
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase(language);
    const matches = normalized
      ? entries.filter((entry) =>
          `${entry.title}\n${entry.client}\n${entry.time}`
            .toLocaleLowerCase(language)
            .includes(normalized),
        )
      : entries;
    return matches.slice(0, 12);
  }, [entries, language, query]);

  useEffect(() => {
    setSelectedIndex((current) => (
      visible.length === 0
        ? -1
        : current >= 0 && current < visible.length
          ? current
          : 0
    ));
  }, [visible]);

  useEffect(() => {
    if (!open || selectedIndex < 0) return;
    document.getElementById(`${listId}-option-${selectedIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [listId, open, selectedIndex]);

  useEffect(() => {
    if (open) return;
    setQuery("");
    setSelectedIndex(-1);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const activeIndex = visible.findIndex((entry) => entry.active);
    setSelectedIndex(activeIndex >= 0 ? activeIndex : visible.length > 0 ? 0 : -1);
    const focusFrame = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((current) => moveListSelection(
        current,
        visible.length,
        event.key === "ArrowDown" ? 1 : -1,
      ));
      return;
    }
    if (event.key !== "Enter") return;
    const selectedEntry = visible[selectedIndex];
    if (!selectedEntry) return;
    event.preventDefault();
    onSelect(selectedEntry);
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="session-search-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.14 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.section
            id="session-search-dialog"
            className="session-search-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t("search.dialog")}
            initial={reduced ? false : { opacity: 0, y: -8, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? undefined : { opacity: 0, y: -5, scale: 0.995 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <label className="session-search-input">
              <Search size={17} strokeWidth={1.55} aria-hidden />
              <input
                ref={inputRef}
                autoFocus
                role="combobox"
                aria-autocomplete="list"
                aria-controls={listId}
                aria-expanded={true}
                aria-activedescendant={selectedIndex >= 0 ? `${listId}-option-${selectedIndex}` : undefined}
                value={query}
                placeholder={t("search.dialog")}
                aria-label={t("search.dialog")}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={onInputKeyDown}
              />
              {query ? (
                <button type="button" aria-label={t("search.clear")} onClick={() => {
                  setQuery("");
                  setSelectedIndex(0);
                }}>
                  <X size={14} strokeWidth={1.65} />
                </button>
              ) : (
                <kbd>Esc</kbd>
              )}
            </label>

            <div id={listId} className="session-search-results" role="listbox" aria-label={t("search.results")}>
              <div className="session-search-caption">{query ? t("search.results") : t("search.recent")}</div>
              {visible.map((entry, index) => (
                <button
                  id={`${listId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === selectedIndex}
                  aria-current={entry.active ? "true" : undefined}
                  className={`session-search-result${entry.active ? " active" : ""}${index === selectedIndex ? " selected" : ""}`}
                  key={entry.path || entry.id}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => onSelect(entry)}
                >
                  <MessageSquare size={14} strokeWidth={1.5} aria-hidden />
                  <span>
                    <strong>{entry.title}</strong>
                    <small>{entry.client}</small>
                  </span>
                  <time>{entry.time}</time>
                </button>
              ))}
              {visible.length === 0 && <div className="session-search-empty">{t("search.noMatches")}</div>}
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
