import type { UiProviderStatus } from "@shared/types";
import { DEFAULT_SUMMARY_MODEL, modelSelectionKey } from "@shared/types";
import { Box, ChevronDown, ChevronRight, Eye, EyeOff, KeyRound, Search, Sparkles } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import { ignoreCommandFailure, useCompass } from "../../store";
import { CopyButton } from "../CopyButton";
import { ModelBrandIcon, ProviderBrandIcon } from "./ModelArtwork";
import { ModelPicker } from "./ModelPicker";

function ProviderRow({ provider }: { provider: UiProviderStatus }): React.JSX.Element {
  const { t } = useI18n();
  const setApiKey = useCompass((state) => state.setApiKey);
  const loginProvider = useCompass((state) => state.loginProvider);
  const removeApiKey = useCompass((state) => state.removeApiKey);
  const setError = useCompass((state) => state.setError);
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState("");
  const [keyVisible, setKeyVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const loginAttempt = useRef(0);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);

  const closeEditor = useCallback((): void => {
    setKey("");
    setKeyVisible(false);
    setEditing(false);
    window.requestAnimationFrame(() => triggerButtonRef.current?.focus());
  }, []);

  const save = async (): Promise<void> => {
    if (!key.trim()) return;
    setBusy(true);
    try {
      await setApiKey(provider.id, key.trim());
      closeEditor();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const login = async (): Promise<void> => {
    const attempt = ++loginAttempt.current;
    setBusy(true);
    try {
      await loginProvider(provider.id);
    } catch (error) {
      if (loginAttempt.current === attempt) setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (loginAttempt.current === attempt) setBusy(false);
    }
  };

  return (
    <div className={`settings-provider-row${provider.configured ? " configured" : ""}`} data-provider-id={provider.id}>
      <ProviderBrandIcon provider={provider.id} size={18} />
      <div className="settings-provider-copy">
        <strong>{provider.name}</strong>
        <span>{provider.configurationIssue ?? (provider.configured ? [provider.source, provider.sourceLabel].filter(Boolean).join(" · ") || t("common.connected") : provider.authNote || t("common.notConfigured"))}</span>
      </div>
      {provider.configured && <span className="settings-provider-state connected">{t("common.connected")}</span>}
      {provider.supportsOAuth && <button type="button" className="settings-text-btn" disabled={busy} onClick={() => void login()}>{provider.configured ? t("settings.reconnect") : t("settings.signIn")}</button>}
      {provider.supportsApiKey && (
        <button type="button" className="settings-text-btn" ref={triggerButtonRef} aria-expanded={editing} onClick={() => editing ? closeEditor() : setEditing(true)}>
          {editing ? t("common.cancel") : provider.configured ? t("settings.replaceKey") : t("settings.setKey")}
        </button>
      )}
      {provider.configured && provider.source === "stored" && (
        <button type="button" className="settings-text-btn muted" onClick={() => ignoreCommandFailure(removeApiKey(provider.id))}>{t("common.remove")}</button>
      )}
      {editing && provider.supportsApiKey && (
        <div className="settings-provider-editor">
          <KeyRound size={14} strokeWidth={1.55} />
          <input
            type={keyVisible ? "text" : "password"}
            value={key}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder={`${provider.name} API key`}
            aria-label={`${provider.name} API key`}
            onChange={(event) => setKey(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") { event.preventDefault(); void save(); }
              if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeEditor(); }
            }}
          />
          <div className="settings-provider-secret-actions">
            <button type="button" className="settings-secret-action" aria-label={keyVisible ? t("settings.hideKey", { name: provider.name }) : t("settings.showKey", { name: provider.name })} aria-pressed={keyVisible} disabled={!key} onClick={() => setKeyVisible((visible) => !visible)}>
              {keyVisible ? <EyeOff size={13} strokeWidth={1.65} /> : <Eye size={13} strokeWidth={1.65} />}
            </button>
            <CopyButton className="settings-secret-copy-button" label={t("settings.copyKey", { name: provider.name })} text={key} />
          </div>
          <button type="button" className="settings-small-btn primary" disabled={busy || !key.trim()} onClick={() => void save()}>{busy ? t("common.saving") : t("common.save")}</button>
        </div>
      )}
    </div>
  );
}

export function ModelsSettings(): React.JSX.Element {
  const { t } = useI18n();
  const models = useCompass((state) => state.models);
  const providers = useCompass((state) => state.providers);
  const settings = useCompass((state) => state.settings);
  const stats = useCompass((state) => state.stats);
  const setModel = useCompass((state) => state.setModel);
  const setModelEnabled = useCompass((state) => state.setModelEnabled);
  const setSummaryModel = useCompass((state) => state.setSummaryModel);
  const [providersOpen, setProvidersOpen] = useState(false);
  const [providerQuery, setProviderQuery] = useState("");

  const configuredProviders = useMemo(() => providers.filter((provider) => provider.configured), [providers]);
  const enabledKeys = useMemo(() => new Set(settings?.enabledModels ?? []), [settings?.enabledModels]);
  const activeModel = stats?.model;
  const activeModelKey = activeModel ? modelSelectionKey(activeModel.provider, activeModel.id) : "";
  const activeKeys = useMemo(() => new Set(activeModelKey ? [activeModelKey] : []), [activeModelKey]);
  const enabledModels = useMemo(() => models.filter((model) => enabledKeys.has(modelSelectionKey(model.provider, model.id))), [enabledKeys, models]);
  const protectedEnabledKeys = useMemo(() => new Set(enabledKeys.size <= 1 && activeModelKey ? [activeModelKey] : []), [activeModelKey, enabledKeys.size]);
  const summarySelection = settings?.summaryModel ?? DEFAULT_SUMMARY_MODEL;
  const summaryModelKey = modelSelectionKey(summarySelection.provider, summarySelection.id);
  const summaryKeys = useMemo(() => new Set([summaryModelKey]), [summaryModelKey]);
  const selectedSummaryModel = models.find((model) => modelSelectionKey(model.provider, model.id) === summaryModelKey);
  const summaryProviderConfigured = providers.some((provider) => provider.id === summarySelection.provider && provider.configured);
  const visibleProviders = useMemo(() => {
    const query = providerQuery.trim().toLowerCase();
    return providers.filter((provider) => !query || `${provider.name} ${provider.id}`.toLowerCase().includes(query));
  }, [providerQuery, providers]);

  return (
    <div className="settings-page settings-models-page" id="settings-page-models">
      <header className="settings-page-head">
        <span className="settings-eyebrow">{t("settings.aiConfiguration")}</span>
        <h1>{t("settings.models")}</h1>
        <p>{t("settings.modelsDescription")}</p>
      </header>
      <div className="settings-card settings-models-card-group" id="settings-models-list">
        <div id="settings-providers" className={`settings-models-card-row settings-models-card-row-accordion${providersOpen ? " open" : ""}`}>
          <button type="button" className="settings-models-card-row-accordion-toggle" aria-expanded={providersOpen} aria-controls="settings-providers-content" onClick={() => setProvidersOpen((open) => !open)}>
            <div className="settings-models-card-row-icon"><KeyRound size={14} strokeWidth={1.55} /></div>
            <div className="settings-models-card-row-copy"><strong>{t("settings.providersKeys")}</strong><span>{t("settings.connectedCount", { count: configuredProviders.length })}</span></div>
            {configuredProviders.length > 0 && (
              <div className="settings-provider-icon-stack" aria-label={t("settings.connectedProvidersList")}>
                {configuredProviders.slice(0, configuredProviders.length > 6 ? 5 : 6).map((provider) => <span key={provider.id} className="settings-provider-chip-icon" title={provider.name}><ProviderBrandIcon provider={provider.id} size={12} /></span>)}
                {configuredProviders.length > 6 && <span className="settings-provider-chip-more" title={`+${configuredProviders.length - 5}`}>+{configuredProviders.length - 5}</span>}
              </div>
            )}
            {providersOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {providersOpen && (
            <div id="settings-providers-content" className="settings-models-card-row-accordion-content">
              <div className="settings-model-search"><Search size={14} strokeWidth={1.55} /><input value={providerQuery} placeholder={t("settings.searchProviders")} aria-label={t("settings.searchProviders")} onChange={(event) => setProviderQuery(event.target.value)} /></div>
              <div className="settings-provider-list">{visibleProviders.map((provider) => <ProviderRow provider={provider} key={provider.id} />)}</div>
            </div>
          )}
        </div>

        <div className="settings-models-card-row">
          <div className="settings-models-card-row-icon"><Box size={16} strokeWidth={1.55} /></div>
          <div className="settings-models-card-row-copy"><strong>{t("settings.enabledModels")}</strong><span>{t("settings.enabledModelsDescription")}</span></div>
          <ModelPicker id="settings-enabled-models-listbox" label={t("settings.enabledModels")} models={models} selectedKeys={enabledKeys} disabledKeys={protectedEnabledKeys} multiple buttonLabel={enabledKeys.size > 0 ? t("settings.enabledCount", { count: enabledKeys.size }) : t("common.notConfigured")} onSelectionChange={(model, selected) => setModelEnabled(model.provider, model.id, !selected)} />
        </div>

        <div className="settings-models-card-row">
          <div className="settings-models-card-row-icon">{activeModel ? <ModelBrandIcon model={activeModel.id} provider={activeModel.provider} size={17} /> : <Box size={16} strokeWidth={1.55} />}</div>
          <div className="settings-models-card-row-copy"><strong>{t("settings.activeModel")}</strong><span>{t("settings.activeModelDescription")}</span></div>
          <ModelPicker id="settings-active-model-listbox" label={t("settings.activeModel")} models={enabledModels} selectedKeys={activeKeys} buttonLabel={activeModel?.name ?? t("composer.selectModel")} onSelectionChange={(model) => setModel(model.provider, model.id)} />
        </div>

        <div className="settings-models-card-row">
          <div className="settings-models-card-row-icon">{selectedSummaryModel ? <ModelBrandIcon model={selectedSummaryModel.id} provider={selectedSummaryModel.provider} size={17} /> : <Sparkles size={16} strokeWidth={1.55} />}</div>
          <div className="settings-models-card-row-copy"><strong>{t("settings.titleModel")}</strong><span>{t("settings.titleModelDescription")}{summaryProviderConfigured ? "" : ` · ${t("settings.providerNotConnected")}`}</span></div>
          <ModelPicker id="settings-summary-model-listbox" label={t("settings.titleModel")} models={models} selectedKeys={summaryKeys} buttonLabel={selectedSummaryModel?.name ?? summarySelection.id} onSelectionChange={(model) => setSummaryModel(model.provider, model.id)} />
        </div>
      </div>
    </div>
  );
}
