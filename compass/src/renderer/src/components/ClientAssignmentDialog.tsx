import { Check, Link2, Plus, Unlink, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { moveListSelection } from "./list-keyboard-navigation";

interface ClientAssignmentDialogProps {
  clients: string[];
  currentClient?: string;
  sessionTitle?: string;
  onClose(): void;
  onSave(name: string): void;
  onUnassign?(): void;
}

export function ClientAssignmentDialog({
  clients,
  currentClient,
  sessionTitle,
  onClose,
  onSave,
  onUnassign,
}: ClientAssignmentDialogProps): React.JSX.Element {
  const { language, t } = useI18n();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(() => {
    const currentIndex = currentClient ? clients.indexOf(currentClient) : -1;
    return currentIndex >= 0 ? currentIndex : clients.length > 0 ? 0 : -1;
  });
  const listId = useId();
  const filteredClients = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase(language);
    return clients.filter((client) => !normalized || client.toLocaleLowerCase(language).includes(normalized));
  }, [clients, language, query]);

  useEffect(() => {
    setActiveIndex((current) => (
      filteredClients.length === 0
        ? -1
        : current >= 0 && current < filteredClients.length
          ? current
          : 0
    ));
  }, [filteredClients]);

  useEffect(() => {
    if (activeIndex < 0) return;
    document.getElementById(`${listId}-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, listId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const save = (): void => {
    if (query.trim()) onSave(query);
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => moveListSelection(
        current,
        filteredClients.length,
        event.key === "ArrowDown" ? 1 : -1,
      ));
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    const selectedClient = filteredClients[activeIndex];
    if (selectedClient) onSave(selectedClient);
    else save();
  };

  return (
    <div
      className="client-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section className="client-dialog" role="dialog" aria-modal="true" aria-labelledby="client-dialog-title">
        <header>
          <div>
            <span>{sessionTitle ? t("client.assignmentEyebrow") : t("client.profileEyebrow")}</span>
            <h2 id="client-dialog-title">{sessionTitle ? t("client.assign") : t("client.newProfile")}</h2>
          </div>
          <button type="button" className="client-dialog-close" aria-label={t("common.close")} onClick={onClose}>
            <X size={15} strokeWidth={1.65} />
          </button>
        </header>
        {sessionTitle && <p className="client-dialog-session" title={sessionTitle}>{sessionTitle}</p>}
        <label className="client-dialog-input">
          <Link2 size={14} strokeWidth={1.55} aria-hidden="true" />
          <input
            autoFocus
            role="combobox"
            aria-autocomplete="list"
            aria-controls={clients.length > 0 ? listId : undefined}
            aria-expanded={clients.length > 0}
            aria-activedescendant={activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
            value={query}
            placeholder={t("client.searchName")}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onInputKeyDown}
          />
          <button type="button" disabled={!query.trim()} onClick={save}>
            <Plus size={14} strokeWidth={1.7} />
            {sessionTitle ? t("client.createAssign") : t("client.create")}
          </button>
        </label>
        {clients.length > 0 && (
          <div id={listId} className="client-dialog-list" role="listbox" aria-label={t("client.existing")}>
            {filteredClients.map((client, index) => (
              <button
                id={`${listId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                data-current={client === currentClient || undefined}
                key={client}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => onSave(client)}
              >
                <span>{client}</span>
                {client === currentClient && <Check size={14} strokeWidth={1.7} />}
              </button>
            ))}
            {filteredClients.length === 0 && <div className="client-dialog-empty">{t("client.noMatches")}</div>}
          </div>
        )}
        {sessionTitle && currentClient && onUnassign && (
          <button type="button" className="client-dialog-unassign" onClick={onUnassign}>
            <Unlink size={14} strokeWidth={1.6} />
            {t("client.moveUnassigned")}
          </button>
        )}
      </section>
    </div>
  );
}
