import type { UiModel } from "@shared/types";
import { modelSelectionKey } from "@shared/types";
import { Check, ChevronDown, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import { ignoreCommandFailure } from "../../store";
import { isSettingsDropdownNavigationKey, nextSettingsDropdownIndex } from "../settings-dropdown";
import { ModelBrandIcon } from "./ModelArtwork";

export interface ModelPickerProps {
  id: string;
  label: string;
  models: UiModel[];
  selectedKeys: ReadonlySet<string>;
  buttonLabel: string;
  multiple?: boolean;
  disabledKeys?: ReadonlySet<string>;
  onSelectionChange: (model: UiModel, selected: boolean) => Promise<void>;
}

function moveMenuFocus(event: React.KeyboardEvent<HTMLElement>, menu: HTMLElement | null, close: () => void): void {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    close();
    return;
  }
  if (!isSettingsDropdownNavigationKey(event.key) || !menu) return;
  if (event.target instanceof HTMLInputElement && event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const options = Array.from(menu.querySelectorAll<HTMLElement>('[role="option"]:not([aria-disabled="true"])'));
  if (options.length === 0) return;
  event.preventDefault();
  const currentIndex = options.findIndex((option) => option === document.activeElement);
  options[nextSettingsDropdownIndex(currentIndex, options.length, event.key)]?.focus();
}

export function ModelPicker(props: ModelPickerProps): React.JSX.Element {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const closeAndRestoreFocus = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    const closeOutside = (event: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, []);

  const filteredModels = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return props.models.filter((model) => !normalizedQuery || `${model.name} ${model.providerName}`.toLowerCase().includes(normalizedQuery));
  }, [props.models, query]);

  const groups = useMemo(() => {
    const result = new Map<string, UiModel[]>();
    for (const model of filteredModels) {
      const group = result.get(model.providerName) ?? [];
      group.push(model);
      result.set(model.providerName, group);
    }
    return [...result.entries()];
  }, [filteredModels]);

  const toggle = (): void => {
    setOpen((current) => !current);
    setQuery("");
  };

  return (
    <div className="settings-summary-model-selector" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`settings-summary-model-dropdown-btn${open ? " open" : ""}`}
        disabled={props.models.length === 0}
        aria-label={props.label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={props.id}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          setOpen(true);
          setQuery("");
        }}
      >
        <span>{props.buttonLabel}</span>
        <ChevronDown size={13} strokeWidth={1.55} />
      </button>
      {open && (
        <div ref={menuRef} className="settings-summary-model-dropdown-menu" onKeyDown={(event) => moveMenuFocus(event, menuRef.current, closeAndRestoreFocus)}>
          <div className="settings-summary-model-dropdown-search">
            <Search size={13} strokeWidth={1.55} />
            <input type="text" value={query} placeholder={t("common.search")} aria-label={`${t("common.search")} ${props.label}`} autoFocus onChange={(event) => setQuery(event.target.value)} />
          </div>
          <div id={props.id} className="settings-summary-model-dropdown-list" role="listbox" aria-label={props.label} aria-multiselectable={props.multiple || undefined}>
            {groups.map(([providerName, models]) => (
              <div key={providerName} className="settings-summary-model-dropdown-group">
                <div className="settings-summary-model-dropdown-group-title">{providerName}</div>
                {models.map((model) => {
                  const key = modelSelectionKey(model.provider, model.id);
                  const selected = props.selectedKeys.has(key);
                  const disabled = props.disabledKeys?.has(key) ?? false;
                  return (
                    <button
                      type="button"
                      role="option"
                      tabIndex={-1}
                      aria-selected={selected}
                      aria-disabled={disabled || undefined}
                      disabled={disabled}
                      className={`settings-summary-model-dropdown-item${selected ? " selected" : ""}`}
                      key={key}
                      onClick={() => {
                        const selection = props.onSelectionChange(model, selected);
                        ignoreCommandFailure(props.multiple
                          ? selection
                          : selection.then(closeAndRestoreFocus));
                      }}
                    >
                      <div className="settings-summary-model-item-content">
                        <ModelBrandIcon model={model.id} provider={model.provider} size={13} />
                        <strong>{model.name}</strong>
                      </div>
                      {selected && <Check size={13} strokeWidth={1.7} />}
                    </button>
                  );
                })}
              </div>
            ))}
            {filteredModels.length === 0 && <div className="settings-summary-model-dropdown-empty">{t("settings.searchNoResults")}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
