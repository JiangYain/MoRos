import type { AppLanguage } from "@shared/types";

export type AgentMessageKey =
  | "compacting" | "compactionFailed" | "compactionComplete" | "retrying"
  | "sessionInvalid" | "sessionDirectory" | "sessionOutside" | "nameEmpty"
  | "sessionArchived" | "sessionNotReady" | "modelNotFound" | "thinkingInvalid"
  | "modelUnavailable" | "modelRequired";

const AGENT_COPY: Record<AppLanguage, Record<AgentMessageKey, string>> = {
  "zh-CN": {
    compacting: "正在压缩会话上下文…", compactionFailed: "上下文压缩失败：{error}", compactionComplete: "上下文压缩完成。",
    retrying: "请求失败，正在自动重试（第 {attempt}/{max} 次）…", sessionInvalid: "会话不存在或路径无效", sessionDirectory: "无法解析会话目录",
    sessionOutside: "路径不在会话目录内", nameEmpty: "名称不能为空", sessionArchived: "会话已在归档目录中", sessionNotReady: "会话尚未就绪",
    modelNotFound: "未找到该模型", thinkingInvalid: "无效的思考深度", modelUnavailable: "该模型当前不可用，请先配置对应 Provider。", modelRequired: "至少需要保留一个可用模型。",
  },
  "zh-TW": {
    compacting: "正在壓縮對話上下文…", compactionFailed: "上下文壓縮失敗：{error}", compactionComplete: "上下文壓縮完成。",
    retrying: "要求失敗，正在自動重試（第 {attempt}/{max} 次）…", sessionInvalid: "對話不存在或路徑無效", sessionDirectory: "無法解析對話目錄",
    sessionOutside: "路徑不在對話目錄內", nameEmpty: "名稱不可為空", sessionArchived: "對話已在封存目錄中", sessionNotReady: "對話尚未就緒",
    modelNotFound: "找不到該模型", thinkingInvalid: "無效的思考深度", modelUnavailable: "此模型目前無法使用，請先設定對應的 Provider。", modelRequired: "至少必須保留一個可用模型。",
  },
  en: {
    compacting: "Compacting conversation context…", compactionFailed: "Context compaction failed: {error}", compactionComplete: "Context compaction complete.",
    retrying: "Request failed. Retrying automatically ({attempt}/{max})…", sessionInvalid: "The conversation does not exist or its path is invalid", sessionDirectory: "Could not resolve the conversation directory",
    sessionOutside: "The path is outside the conversation directory", nameEmpty: "The name cannot be empty", sessionArchived: "The conversation is already archived", sessionNotReady: "The conversation is not ready",
    modelNotFound: "Model not found", thinkingInvalid: "Invalid thinking level", modelUnavailable: "This model is unavailable. Configure its provider first.", modelRequired: "At least one available model must remain enabled.",
  },
  de: {
    compacting: "Unterhaltungskontext wird komprimiert…", compactionFailed: "Kontextkomprimierung fehlgeschlagen: {error}", compactionComplete: "Kontextkomprimierung abgeschlossen.",
    retrying: "Anfrage fehlgeschlagen. Automatischer Neuversuch ({attempt}/{max})…", sessionInvalid: "Die Unterhaltung existiert nicht oder der Pfad ist ungültig", sessionDirectory: "Unterhaltungsverzeichnis konnte nicht aufgelöst werden",
    sessionOutside: "Der Pfad liegt außerhalb des Unterhaltungsverzeichnisses", nameEmpty: "Der Name darf nicht leer sein", sessionArchived: "Die Unterhaltung ist bereits archiviert", sessionNotReady: "Die Unterhaltung ist noch nicht bereit",
    modelNotFound: "Modell nicht gefunden", thinkingInvalid: "Ungültige Denktiefe", modelUnavailable: "Dieses Modell ist nicht verfügbar. Konfigurieren Sie zuerst den Provider.", modelRequired: "Mindestens ein verfügbares Modell muss aktiviert bleiben.",
  },
};

export function agentMessage(
  language: AppLanguage,
  key: AgentMessageKey,
  values: Record<string, string | number> = {},
): string {
  return Object.entries(values).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
    AGENT_COPY[language][key],
  );
}
