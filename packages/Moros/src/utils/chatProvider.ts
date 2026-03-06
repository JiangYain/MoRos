export type ChatProvider = "github-copilot";

export type ChatModelOption = {
	id: string;
	label: string;
};

const LS_PROVIDER_KEY = "moros-active-chat-provider";
const LS_MODEL_KEY = "moros-active-chat-model";

export const CHAT_PROVIDER_OPTIONS: Array<{ id: ChatProvider; label: string }> = [
	{ id: "github-copilot", label: "GitHub Copilot" },
];

export const CHAT_MODEL_OPTIONS: ChatModelOption[] = [
	{ id: "claude-sonnet-4.6", label: "Claude Sonnet 4.6" },
	{ id: "gpt-5.3-codex", label: "GPT-5.3-Codex" },
	{ id: "gpt-4o", label: "GPT-4o" },
];

export const DEFAULT_CHAT_PROVIDER: ChatProvider = "github-copilot";
export const DEFAULT_CHAT_MODEL = CHAT_MODEL_OPTIONS[0].id;

const normalizeModelKey = (value: string): string => {
	return String(value || "")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");
};

const MODEL_ALIAS_CANDIDATES: Record<string, string[]> = {
	"claude-sonnet-4.6": ["claudesonnet46", "claudesonnet4", "claudesonnet"],
	"gpt-5.3-codex": ["gpt53codex", "gpt5codex", "gpt52codex", "gpt5"],
	"gpt-4o": ["gpt4o", "gpt41mini", "gpt41"],
};

const canonicalizeKnownModel = (model: string): string => {
	const normalized = String(model || "").trim();
	if (!normalized) return DEFAULT_CHAT_MODEL;
	if (CHAT_MODEL_OPTIONS.some((option) => option.id === normalized)) return normalized;

	const key = normalizeModelKey(normalized);
	if (!key) return DEFAULT_CHAT_MODEL;
	for (const option of CHAT_MODEL_OPTIONS) {
		const aliases = MODEL_ALIAS_CANDIDATES[option.id] || [normalizeModelKey(option.id)];
		for (const alias of aliases) {
			if (!alias) continue;
			if (key === alias || key.includes(alias) || alias.includes(key)) {
				return option.id;
			}
		}
	}
	return DEFAULT_CHAT_MODEL;
};

export const normalizeChatProvider = (_value: unknown): ChatProvider => {
	return "github-copilot";
};

export const normalizeChatModel = (value: unknown): string => {
	const model = String(value || "").trim();
	return canonicalizeKnownModel(model);
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
