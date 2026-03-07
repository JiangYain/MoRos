export type ChatProvider = "github-copilot" | "opencode-go";

export type ChatModelOption = {
	id: string;
	label: string;
};

const LS_PROVIDER_KEY = "moros-active-chat-provider";
const LS_MODEL_KEY = "moros-active-chat-model";

export const CHAT_PROVIDER_OPTIONS: Array<{ id: ChatProvider; label: string }> = [
	{ id: "github-copilot", label: "GitHub Copilot" },
	{ id: "opencode-go", label: "OpenCode Go" },
];

const COPILOT_CHAT_MODEL_OPTIONS: ChatModelOption[] = [
	{ id: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
	{ id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
	{ id: "claude-sonnet-4.6", label: "Claude Sonnet 4.6" },
	{ id: "gpt-4o", label: "GPT-4o" },
];

const OPENCODE_GO_MODEL_OPTIONS: ChatModelOption[] = [
	{ id: "glm-5", label: "GLM-5" },
	{ id: "kimi-k2.5", label: "Kimi K2.5" },
	{ id: "minimax-m2.5", label: "MiniMax M2.5" },
];

export const CHAT_MODELS_BY_PROVIDER: Record<ChatProvider, ChatModelOption[]> = {
	"github-copilot": COPILOT_CHAT_MODEL_OPTIONS,
	"opencode-go": OPENCODE_GO_MODEL_OPTIONS,
};

// Backward compatibility for existing imports (GitHub Copilot preferred models).
export const CHAT_MODEL_OPTIONS: ChatModelOption[] = COPILOT_CHAT_MODEL_OPTIONS;

export const DEFAULT_CHAT_PROVIDER: ChatProvider = "github-copilot";

export const getDefaultChatModel = (provider: ChatProvider = DEFAULT_CHAT_PROVIDER): string => {
	const options = CHAT_MODELS_BY_PROVIDER[provider] || CHAT_MODEL_OPTIONS;
	return options[0]?.id || CHAT_MODEL_OPTIONS[0].id;
};

export const DEFAULT_CHAT_MODEL = getDefaultChatModel(DEFAULT_CHAT_PROVIDER);

const normalizeModelKey = (value: string): string => {
	return String(value || "")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");
};

const MODEL_ALIAS_CANDIDATES: Record<string, string[]> = {
	"gpt-5.3-codex": ["gpt53codex", "gpt53", "gpt5codex", "gpt5"],
	"gemini-3.1-pro-preview": ["gemini31propreview", "gemini31pro", "gemini3.1pro", "geminipro", "gemini31"],
	"claude-sonnet-4.6": ["claudesonnet46", "claudesonnet4", "claudesonnet"],
	"gpt-4o": ["gpt4o", "gpt41mini", "gpt41"],
	"glm-5": ["glm5"],
	"kimi-k2.5": ["kimik25", "k2.5", "k25"],
	"minimax-m2.5": ["minimaxm25", "m2.5", "m25"],
};

const PROVIDER_MODEL_ORDER: ChatProvider[] = CHAT_PROVIDER_OPTIONS.map((option) => option.id);
const ALL_CHAT_MODEL_OPTIONS: ChatModelOption[] = Array.from(
	new Map(
		PROVIDER_MODEL_ORDER.flatMap((providerId) =>
			(CHAT_MODELS_BY_PROVIDER[providerId] || []).map((option) => [option.id, option]),
		),
	).values(),
);

export const normalizeChatProvider = (value: unknown): ChatProvider => {
	const normalized = String(value || "")
		.trim()
		.toLowerCase();
	return normalized === "opencode-go" ? "opencode-go" : "github-copilot";
};

export const getChatModelOptions = (provider?: unknown): ChatModelOption[] => {
	const normalizedProvider = normalizeChatProvider(provider);
	return CHAT_MODELS_BY_PROVIDER[normalizedProvider] || CHAT_MODEL_OPTIONS;
};

export const getAllChatModelOptions = (): ChatModelOption[] => {
	return ALL_CHAT_MODEL_OPTIONS;
};

const resolveModelFromOptions = (model: string, options: ChatModelOption[]): string => {
	const normalized = String(model || "").trim();
	if (!normalized) return "";
	if (options.some((option) => option.id === normalized)) return normalized;

	const key = normalizeModelKey(normalized);
	if (!key) return "";
	for (const option of options) {
		const aliases = MODEL_ALIAS_CANDIDATES[option.id] || [normalizeModelKey(option.id)];
		for (const alias of aliases) {
			if (!alias) continue;
			if (key === alias || key.includes(alias) || alias.includes(key)) {
				return option.id;
			}
		}
	}
	return "";
};

export const normalizeChatModel = (value: unknown, provider?: unknown): string => {
	const normalizedProvider = normalizeChatProvider(provider);
	const model = String(value || "").trim();
	const providerOptions = getChatModelOptions(normalizedProvider);
	const providerMatch = resolveModelFromOptions(model, providerOptions);
	if (providerMatch) return providerMatch;

	if (provider === undefined) {
		const globalMatch = resolveModelFromOptions(model, ALL_CHAT_MODEL_OPTIONS);
		if (globalMatch) return globalMatch;
	}

	return getDefaultChatModel(normalizedProvider);
};

export const getProvidersForModel = (model: unknown): ChatProvider[] => {
	const normalizedModel = normalizeChatModel(model);
	const matchedProviders = PROVIDER_MODEL_ORDER.filter((providerId) =>
		getChatModelOptions(providerId).some((option) => option.id === normalizedModel),
	);
	return matchedProviders.length > 0 ? matchedProviders : [DEFAULT_CHAT_PROVIDER];
};

export const resolveProviderForModel = (model: unknown, fallbackProvider?: unknown): ChatProvider => {
	const normalizedFallback = fallbackProvider === undefined ? undefined : normalizeChatProvider(fallbackProvider);
	const candidates = getProvidersForModel(model);
	return candidates[0] || normalizedFallback || DEFAULT_CHAT_PROVIDER;
};

export const getActiveChatProvider = (): ChatProvider => {
	try {
		return normalizeChatProvider(localStorage.getItem(LS_PROVIDER_KEY));
	} catch {
		return DEFAULT_CHAT_PROVIDER;
	}
};

export const getActiveChatModel = (provider?: unknown): string => {
	try {
		const resolvedProvider = provider === undefined ? getActiveChatProvider() : normalizeChatProvider(provider);
		return normalizeChatModel(localStorage.getItem(LS_MODEL_KEY), resolvedProvider);
	} catch {
		return getDefaultChatModel(provider === undefined ? DEFAULT_CHAT_PROVIDER : normalizeChatProvider(provider));
	}
};

export const setActiveChatProvider = (provider: ChatProvider) => {
	try {
		const normalizedProvider = normalizeChatProvider(provider);
		localStorage.setItem(LS_PROVIDER_KEY, normalizedProvider);
		const currentModel = localStorage.getItem(LS_MODEL_KEY);
		localStorage.setItem(LS_MODEL_KEY, normalizeChatModel(currentModel, normalizedProvider));
	} catch {}
};

export const setActiveChatModel = (model: string, provider?: unknown) => {
	try {
		const normalizedProvider = provider === undefined ? getActiveChatProvider() : normalizeChatProvider(provider);
		localStorage.setItem(LS_MODEL_KEY, normalizeChatModel(model, normalizedProvider));
	} catch {}
};
