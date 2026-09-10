import type { VoiceInputUpdate } from "@shared/types";
import { useEffect, useRef, useState } from "react";
import { api, isDesktop } from "../../ipc";
import { useI18n } from "../../i18n";
import { useMoros } from "../../store";

type DictationPhase = "idle" | "starting" | "listening" | "processing" | "complete";
interface DictationState { phase: DictationPhase; preview: string }

export interface ComposerDictation {
  busy: boolean;
  label: string;
  state: DictationState;
  start(): void;
}

export function useComposerDictation(
  textareaRef: React.RefObject<{ focus(): void } | null>,
  appendText: (text: string) => void,
  closeMenus: () => void,
): ComposerDictation {
  const { t } = useI18n();
  const setError = useMoros((state) => state.setError);
  const [state, setState] = useState<DictationState>({ phase: "idle", preview: "" });
  const resetRef = useRef<number | null>(null);
  useEffect(() => () => { if (resetRef.current !== null) window.clearTimeout(resetRef.current); }, []);

  const resetAfter = (delay: number): void => {
    if (resetRef.current !== null) window.clearTimeout(resetRef.current);
    resetRef.current = window.setTimeout(() => {
      resetRef.current = null;
      setState({ phase: "idle", preview: "" });
    }, delay);
  };

  const start = (): void => {
    if (state.phase !== "idle") return;
    closeMenus();
    textareaRef.current?.focus();
    setState({ phase: "starting", preview: isDesktop ? t("composer.voiceOpening") : t("composer.micConnecting") });
    window.setTimeout(() => {
      const onUpdate = isDesktop ? undefined : (update: VoiceInputUpdate): void => setState({
        phase: update.phase,
        preview: update.interimText || (update.phase === "listening" ? t("composer.voiceListening") : t("composer.voiceProcessingPreview")),
      });
      void api.startDictation(onUpdate).then((result) => {
        if (!result.ok) {
          setError(result.error ?? t("composer.voiceStartFailed"));
          setState({ phase: "idle", preview: "" });
          return;
        }
        if (result.text) {
          appendText(result.text);
          requestAnimationFrame(() => textareaRef.current?.focus());
        }
        setState({ phase: "complete", preview: isDesktop ? t("composer.voiceOpened") : result.text || t("composer.voiceRecognized") });
        resetAfter(isDesktop ? 1600 : 900);
      }).catch((error: unknown) => {
        setError(error instanceof Error ? error.message : String(error));
        setState({ phase: "idle", preview: "" });
      });
    }, 120);
  };

  const label = state.phase === "starting" ? t("composer.voiceStart") : state.phase === "listening" ? t("composer.voiceListening") : state.phase === "processing" ? t("composer.voiceProcessing") : t("composer.voiceReady");
  return { busy: state.phase !== "idle", label, state, start };
}
