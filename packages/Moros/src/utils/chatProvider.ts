export type ChatProvider = "dify" | "github-copilot";

export type ChatModelOption = {
	id: string;
	label: string;
};

const LS_PROVIDER_KEY = "moros-active-chat-provider";
const LS_MODEL_KEY = "moros-active-chat-model";

export const CHAT_PROVIDER_OPTIONS: Array<{ id: ChatProvider; label: string }> = [
	{ id: "dify", label: "Dify" },
	{ id: "github-copilot", label: "GitHub Copilot" },
];

export const CHAT_MODEL_OPTIONS: ChatModelOption[] = [
	{ id: "claude-sonnet-4.6", label: "Claude Sonnet 4.6" },
	{ id: "gpt-5.3-codex", label: "GPT-5.3-Codex" },
	{ id: "gpt-4o", label: "GPT-4o" },
];

export const DEFAULT_CHAT_PROVIDER: ChatProvider = "dify";
export const DEFAULT_CHAT_MODEL = CHAT_MODEL_OPTIONS[0].id;

export const normalizeChatProvider = (value: unknown): ChatProvider => {
	return value === "github-copilot" ? "github-copilot" : "dify";
};

export const normalizeChatModel = (value: unknown): string => {
	const model = String(value || "").trim();
	if (!model) return DEFAULT_CHAT_MODEL;
	return CHAT_MODEL_OPTIONS.some((option) => option.id === model) ? model : DEFAULT_CHAT_MODEL;
};

export const getActiveChatProvider = (): ChatProvider => {
	try {
		return normalizeChatProvider(localStorage.getItem(LS_PROVIDER_KEY));
	} catch {
		return DEFAULT_CHAT_PROVIDER;
	}
};

export const getActiveChatModel = (): string => {
	try {
		return normalizeChatModel(localStorage.getItem(LS_MODEL_KEY));
	} catch {
		return DEFAULT_CHAT_MODEL;
	}
};

export const setActiveChatProvider = (provider: ChatProvider) => {
	try {
		localStorage.setItem(LS_PROVIDER_KEY, normalizeChatProvider(provider));
	} catch {}
};

export const setActiveChatModel = (model: string) => {
	try {
		localStorage.setItem(LS_MODEL_KEY, normalizeChatModel(model));
	} catch {}
};
