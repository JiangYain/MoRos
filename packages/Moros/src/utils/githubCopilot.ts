import { CHAT_MODEL_OPTIONS } from "./chatProvider";

const GITHUB_CLIENT_ID = atob("SXYxLmI1MDdhMDhjODdlY2ZlOTg=");
const LS_GITHUB_COPILOT_KEY = "moros-github-copilot-oauth";
const LS_GITHUB_COPILOT_PROXY_ENABLED = "moros-github-copilot-proxy-enabled";
const LS_GITHUB_COPILOT_PROXY_URL = "moros-github-copilot-proxy-url";
const LS_GITHUB_COPILOT_MODELS_CACHE = "moros-github-copilot-models-cache";
const LS_GITHUB_COPILOT_INTEGRATION_ID = "moros-github-copilot-integration-id";
const DEFAULT_GITHUB_COPILOT_PROXY_URL = "http://localhost:53211/api/proxy";
const GITHUB_COPILOT_MODELS_CACHE_TTL = 5 * 60 * 1000;
const DEFAULT_COPILOT_INTEGRATION_ID = "vscode-chat";
const COPILOT_INTEGRATION_ID_CANDIDATES = [
	DEFAULT_COPILOT_INTEGRATION_ID,
	"vscode",
	"vscode-insiders",
	"copilot-chat",
	"github-copilot",
];
const UNKNOWN_COPILOT_INTEGRATION_PATTERN = /unknown\s+Copilot-Integration-Id/i;

const COPILOT_HEADERS = {
	"Editor-Version": "vscode/1.107.0",
	"Editor-Plugin-Version": "copilot-chat/0.35.0",
	"Copilot-Integration-Id": DEFAULT_COPILOT_INTEGRATION_ID,
} as const;

export type GitHubCopilotCredentials = {
	refresh: string;
	access: string;
	expires: number;
	enterpriseDomain?: string;
	updatedAt: number;
};

type GitHubCopilotModelsCache = {
	baseUrl: string;
	models: string[];
	updatedAt: number;
};

type DeviceCodeResponse = {
	device_code: string;
	user_code: string;
	verification_uri: string;
	verification_uri_complete?: string;
	interval: number;
	expires_in: number;
};

export type GitHubCopilotStreamEvent =
	| { event: "message"; answer: string }
	| { event: "message_end" }
	| { event: "error"; message: string };

export interface GitHubCopilotStreamHandle {
	stop: () => Promise<void>;
	abort: () => void;
}

export type CopilotChatContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export type CopilotChatMessage = {
	role: "system" | "user" | "assistant";
	content: string | CopilotChatContentPart[];
};

const normalizeDomain = (input?: string): string | null => {
	const trimmed = String(input || "").trim();
	if (!trimmed) return null;
	try {
		const withProtocol = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
		return new URL(withProtocol).hostname;
	} catch {
		return null;
	}
};

const getCopilotUrls = (domain: string) => {
	return {
		deviceCodeUrl: `https://${domain}/login/device/code`,
		accessTokenUrl: `https://${domain}/login/oauth/access_token`,
		copilotTokenUrl: `https://api.${domain}/copilot_internal/v2/token`,
	};
};

const parseProxyEndpointBaseUrl = (token?: string): string | null => {
	if (!token) return null;
	const match = String(token).match(/proxy-ep=([^;]+)/);
	if (!match) return null;
	const apiHost = match[1].replace(/^proxy\./, "api.");
	return `https://${apiHost}`;
};

export const getGitHubCopilotBaseUrl = (token?: string, enterpriseDomain?: string): string => {
	const tokenBasedUrl = parseProxyEndpointBaseUrl(token);
	if (tokenBasedUrl) return tokenBasedUrl;
	if (enterpriseDomain) return `https://copilot-api.${enterpriseDomain}`;
	return "https://api.individual.githubcopilot.com";
};

export const getGitHubCopilotProxyEnabled = (): boolean => {
	try {
		const value = localStorage.getItem(LS_GITHUB_COPILOT_PROXY_ENABLED);
		if (value === null) return true;
		return value !== "false";
	} catch {
		return true;
	}
};

export const setGitHubCopilotProxyEnabled = (enabled: boolean) => {
	try {
		localStorage.setItem(LS_GITHUB_COPILOT_PROXY_ENABLED, enabled ? "true" : "false");
	} catch {}
};

export const getGitHubCopilotProxyUrl = (): string => {
	try {
		const value = String(localStorage.getItem(LS_GITHUB_COPILOT_PROXY_URL) || "").trim();
		return value || DEFAULT_GITHUB_COPILOT_PROXY_URL;
	} catch {
		return DEFAULT_GITHUB_COPILOT_PROXY_URL;
	}
};

export const setGitHubCopilotProxyUrl = (url: string) => {
	try {
		const normalized = String(url || "").trim();
		localStorage.setItem(LS_GITHUB_COPILOT_PROXY_URL, normalized || DEFAULT_GITHUB_COPILOT_PROXY_URL);
	} catch {}
};

const buildProxyRequestUrl = (targetUrl: string): string => {
	if (!getGitHubCopilotProxyEnabled()) return targetUrl;
	const proxyUrl = getGitHubCopilotProxyUrl().replace(/\/$/, "");
	return `${proxyUrl}?url=${encodeURIComponent(targetUrl)}`;
};

const getStoredCopilotIntegrationId = (): string => {
	try {
		const value = String(localStorage.getItem(LS_GITHUB_COPILOT_INTEGRATION_ID) || "").trim();
		return value || DEFAULT_COPILOT_INTEGRATION_ID;
	} catch {
		return DEFAULT_COPILOT_INTEGRATION_ID;
	}
};

const setStoredCopilotIntegrationId = (integrationId: string) => {
	const normalized = String(integrationId || "").trim();
	if (!normalized) return;
	try {
		localStorage.setItem(LS_GITHUB_COPILOT_INTEGRATION_ID, normalized);
	} catch {}
};

const buildCopilotIntegrationIdCandidates = (): string[] => {
	const preferred = getStoredCopilotIntegrationId();
	return Array.from(new Set([preferred, ...COPILOT_INTEGRATION_ID_CANDIDATES]));
};

const headersToRecord = (headers?: Record<string, string> | Headers | [string, string][]): Record<string, string> => {
	const record: Record<string, string> = {};
	if (!headers) return record;
	if (headers instanceof Headers) {
		headers.forEach((value, key) => {
			record[key] = value;
		});
		return record;
	}
	if (Array.isArray(headers)) {
		headers.forEach(([key, value]) => {
			record[String(key)] = String(value);
		});
		return record;
	}
	Object.entries(headers).forEach(([key, value]) => {
		if (value === undefined || value === null) return;
		record[key] = String(value);
	});
	return record;
};

const isUnknownCopilotIntegrationError = (status: number, bodyText: string): boolean => {
	return status === 400 && UNKNOWN_COPILOT_INTEGRATION_PATTERN.test(String(bodyText || ""));
};

type CopilotFetchResult = {
	response: Response;
	integrationId: string;
	errorText?: string;
};

const fetchCopilotWithIntegrationFallback = async (url: string, init: RequestInit): Promise<CopilotFetchResult> => {
	const candidates = buildCopilotIntegrationIdCandidates();
	for (let index = 0; index < candidates.length; index += 1) {
		const integrationId = candidates[index];
		const headers = {
			...headersToRecord(init.headers),
			"Copilot-Integration-Id": integrationId,
		};
		const response = await fetch(buildProxyRequestUrl(url), {
			...init,
			headers,
		});
		if (response.ok) {
			if (integrationId !== getStoredCopilotIntegrationId()) {
				setStoredCopilotIntegrationId(integrationId);
			}
			return { response, integrationId };
		}
		const errorText = await response.text().catch(() => "");
		const shouldRetry = isUnknownCopilotIntegrationError(response.status, errorText) && index < candidates.length - 1;
		if (shouldRetry) continue;
		return { response, integrationId, errorText };
	}
	throw new Error("Copilot request failed: no valid Copilot-Integration-Id found");
};

const normalizeModelId = (value: unknown): string => {
	return String(value || "").trim();
};

const parseModelsFromPayload = (payload: any): string[] => {
	const sourceCandidates: any[] = [];
	if (Array.isArray(payload)) {
		sourceCandidates.push(payload);
	}
	if (payload && typeof payload === "object") {
		if (Array.isArray(payload.data)) sourceCandidates.push(payload.data);
		if (Array.isArray(payload.models)) sourceCandidates.push(payload.models);
		if (Array.isArray(payload.items)) sourceCandidates.push(payload.items);
	}

	const models = sourceCandidates
		.flatMap((items) => {
			return items.map((item: any) => {
				if (typeof item === "string") return normalizeModelId(item);
				if (item && typeof item === "object") return normalizeModelId(item.id);
				return "";
			});
		})
		.filter(Boolean);

	return Array.from(new Set(models));
};

const readModelsCache = (): GitHubCopilotModelsCache | null => {
	try {
		const raw = localStorage.getItem(LS_GITHUB_COPILOT_MODELS_CACHE);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (
			!parsed ||
			typeof parsed !== "object" ||
			typeof parsed.baseUrl !== "string" ||
			typeof parsed.updatedAt !== "number" ||
			!Array.isArray(parsed.models)
		) {
			return null;
		}
		const models = parsed.models.map((model: unknown) => normalizeModelId(model)).filter(Boolean);
		return {
			baseUrl: parsed.baseUrl,
			updatedAt: parsed.updatedAt,
			models,
		};
	} catch {
		return null;
	}
};

const writeModelsCache = (baseUrl: string, models: string[]) => {
	try {
		const payload: GitHubCopilotModelsCache = {
			baseUrl,
			models: Array.from(new Set(models.map((model) => normalizeModelId(model)).filter(Boolean))),
			updatedAt: Date.now(),
		};
		localStorage.setItem(LS_GITHUB_COPILOT_MODELS_CACHE, JSON.stringify(payload));
	} catch {}
};

const fetchCopilotModelsByToken = async (
	token: string,
	enterpriseDomain?: string,
	forceRefresh = false,
): Promise<string[]> => {
	const baseUrl = getGitHubCopilotBaseUrl(token, enterpriseDomain);
	if (!forceRefresh) {
		const cached = readModelsCache();
		if (
			cached &&
			cached.baseUrl === baseUrl &&
			Date.now() - cached.updatedAt < GITHUB_COPILOT_MODELS_CACHE_TTL &&
			cached.models.length > 0
		) {
			return cached.models;
		}
	}

	const { response, errorText } = await fetchCopilotWithIntegrationFallback(`${baseUrl}/models`, {
		headers: {
			Authorization: `Bearer ${token}`,
			...COPILOT_HEADERS,
		},
	});
	if (!response.ok) {
		throw new Error(`${response.status} ${response.statusText} ${errorText || ""}`.trim());
	}
	const payload = await response.json().catch(() => ({}));
	const models = parseModelsFromPayload(payload);
	if (models.length > 0) {
		writeModelsCache(baseUrl, models);
	}
	return models;
};

const MODEL_ALIAS_CANDIDATES: Record<string, string[]> = {
	"gpt-5.3-codex": ["gpt-5.3-codex", "gpt-5.3", "gpt-5"],
	"gemini-3.1-pro-preview": ["gemini-3.1-pro-preview", "gemini-3.1-pro", "gemini-3-pro", "gemini-pro"],
	"claude-sonnet-4.6": ["claude-sonnet-4.6", "claude-sonnet-4", "claude-sonnet"],
	"gpt-4o": ["gpt-4o", "gpt-4.1", "gpt-4.1-mini"],
};

const selectBestCopilotModel = (requestedModel: string, availableModels: string[]): string => {
	const requested = normalizeModelId(requestedModel);
	if (!requested || availableModels.length === 0) return requested;

	const availableSet = new Set(availableModels);
	if (availableSet.has(requested)) return requested;

	const normalizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
	const requestedKey = normalizeKey(requested);
	const normalizedMatch = availableModels.find((model) => normalizeKey(model) === requestedKey);
	if (normalizedMatch) return normalizedMatch;

	const aliasCandidates = MODEL_ALIAS_CANDIDATES[requested] || [requested];
	for (const alias of aliasCandidates) {
		if (availableSet.has(alias)) return alias;
		const key = normalizeKey(alias);
		const fuzzy = availableModels.find(
			(model) => normalizeKey(model).includes(key) || key.includes(normalizeKey(model)),
		);
		if (fuzzy) return fuzzy;
	}

	const preferred = CHAT_MODEL_OPTIONS.map((option) => option.id);
	for (const modelId of preferred) {
		if (availableSet.has(modelId)) return modelId;
	}
	return availableModels[0];
};

const fetchJson = async (url: string, init: RequestInit): Promise<any> => {
	const response = await fetch(buildProxyRequestUrl(url), init);
	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new Error(`${response.status} ${response.statusText} ${text}`.trim());
	}
	return response.json();
};

const startDeviceFlow = async (domain: string): Promise<DeviceCodeResponse> => {
	const urls = getCopilotUrls(domain);
	const raw = await fetchJson(urls.deviceCodeUrl, {
		method: "POST",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			client_id: GITHUB_CLIENT_ID,
			scope: "read:user",
		}),
	});

	const deviceCode = raw?.device_code;
	const userCode = raw?.user_code;
	const verificationUri = raw?.verification_uri;
	const interval = raw?.interval;
	const expiresIn = raw?.expires_in;

	if (
		typeof deviceCode !== "string" ||
		typeof userCode !== "string" ||
		typeof verificationUri !== "string" ||
		typeof interval !== "number" ||
		typeof expiresIn !== "number"
	) {
		throw new Error("Invalid GitHub device code response");
	}

	let verificationUriComplete =
		typeof raw?.verification_uri_complete === "string" ? raw.verification_uri_complete : "";
	if (!verificationUriComplete) {
		try {
			const url = new URL(verificationUri);
			url.searchParams.set("user_code", userCode);
			verificationUriComplete = url.toString();
		} catch {
			verificationUriComplete = `${verificationUri}${verificationUri.includes("?") ? "&" : "?"}user_code=${encodeURIComponent(userCode)}`;
		}
	}

	return {
		device_code: deviceCode,
		user_code: userCode,
		verification_uri: verificationUri,
		verification_uri_complete: verificationUriComplete,
		interval,
		expires_in: expiresIn,
	};
};

const abortableDelay = (ms: number, signal?: AbortSignal) => {
	return new Promise<void>((resolve, reject) => {
		if (signal?.aborted) {
			reject(new Error("Login cancelled"));
			return;
		}
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				reject(new Error("Login cancelled"));
			},
			{ once: true },
		);
	});
};

const pollForGitHubAccessToken = async (
	domain: string,
	deviceCode: string,
	intervalSeconds: number,
	expiresInSeconds: number,
	signal?: AbortSignal,
): Promise<string> => {
	const urls = getCopilotUrls(domain);
	const deadline = Date.now() + expiresInSeconds * 1000;
	let pollMs = Math.max(1000, Math.floor(intervalSeconds * 1000));

	while (Date.now() < deadline) {
		if (signal?.aborted) throw new Error("Login cancelled");

		const raw = await fetchJson(urls.accessTokenUrl, {
			method: "POST",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				client_id: GITHUB_CLIENT_ID,
				device_code: deviceCode,
				grant_type: "urn:ietf:params:oauth:grant-type:device_code",
			}),
		});

		if (typeof raw?.access_token === "string" && raw.access_token) {
			return raw.access_token;
		}

		if (raw?.error === "authorization_pending") {
			await abortableDelay(pollMs, signal);
			continue;
		}
		if (raw?.error === "slow_down") {
			pollMs += 5000;
			await abortableDelay(pollMs, signal);
			continue;
		}
		if (raw?.error) {
			throw new Error(`Device flow failed: ${raw.error}`);
		}

		await abortableDelay(pollMs, signal);
	}

	throw new Error("GitHub device flow timed out");
};

export const refreshGitHubCopilotToken = async (
	refreshToken: string,
	enterpriseDomain?: string,
): Promise<GitHubCopilotCredentials> => {
	const domain = enterpriseDomain || "github.com";
	const urls = getCopilotUrls(domain);

	const raw = await fetchJson(urls.copilotTokenUrl, {
		headers: {
			Accept: "application/json",
			Authorization: `Bearer ${refreshToken}`,
			...COPILOT_HEADERS,
		},
	});

	const token = raw?.token;
	const expiresAt = raw?.expires_at;
	if (typeof token !== "string" || typeof expiresAt !== "number") {
		throw new Error("Invalid GitHub Copilot token response");
	}

	return {
		refresh: refreshToken,
		access: token,
		// 提前 5 分钟过期，避免边界时间抖动
		expires: expiresAt * 1000 - 5 * 60 * 1000,
		enterpriseDomain,
		updatedAt: Date.now(),
	};
};

const enableModelPolicy = async (modelId: string, token: string, enterpriseDomain?: string): Promise<boolean> => {
	const baseUrl = getGitHubCopilotBaseUrl(token, enterpriseDomain);
	try {
		const { response } = await fetchCopilotWithIntegrationFallback(
			`${baseUrl}/models/${encodeURIComponent(modelId)}/policy`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
					...COPILOT_HEADERS,
					"openai-intent": "chat-policy",
					"x-interaction-type": "chat-policy",
				},
				body: JSON.stringify({ state: "enabled" }),
			},
		);
		return response.ok;
	} catch {
		return false;
	}
};

const enablePreferredModels = async (
	token: string,
	enterpriseDomain?: string,
	onProgress?: (message: string) => void,
) => {
	const baseUrl = getGitHubCopilotBaseUrl(token, enterpriseDomain);
	// business endpoint currently rejects /models/:id/policy with 400, skip noisy calls.
	if (baseUrl.includes("api.business.githubcopilot.com")) {
		onProgress?.("Model policy auto-enable skipped on business endpoint");
		return;
	}

	let requested = CHAT_MODEL_OPTIONS.map((model) => model.id);
	try {
		const availableModels = await fetchCopilotModelsByToken(token, enterpriseDomain);
		if (availableModels.length > 0) {
			const availableSet = new Set(availableModels);
			requested = requested.filter((modelId) => availableSet.has(modelId));
		}
	} catch {}

	if (requested.length === 0) {
		onProgress?.("No preferred model policies to enable");
		return;
	}

	await Promise.all(
		requested.map(async (modelId) => {
			const ok = await enableModelPolicy(modelId, token, enterpriseDomain);
			onProgress?.(`${modelId}: ${ok ? "enabled" : "skipped"}`);
		}),
	);
};

export const setGitHubCopilotCredentials = (credentials: GitHubCopilotCredentials) => {
	try {
		localStorage.setItem(LS_GITHUB_COPILOT_KEY, JSON.stringify(credentials));
	} catch {}
};

export const getGitHubCopilotCredentials = (): GitHubCopilotCredentials | null => {
	try {
		const raw = localStorage.getItem(LS_GITHUB_COPILOT_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (
			typeof parsed?.refresh !== "string" ||
			typeof parsed?.access !== "string" ||
			typeof parsed?.expires !== "number"
		) {
			return null;
		}
		return {
			refresh: parsed.refresh,
			access: parsed.access,
			expires: parsed.expires,
			enterpriseDomain: typeof parsed.enterpriseDomain === "string" ? parsed.enterpriseDomain : undefined,
			updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
		};
	} catch {
		return null;
	}
};

export const clearGitHubCopilotCredentials = () => {
	try {
		localStorage.removeItem(LS_GITHUB_COPILOT_KEY);
	} catch {}
};

export const isGitHubCopilotAuthorized = (): boolean => {
	const credentials = getGitHubCopilotCredentials();
	if (!credentials) return false;
	return credentials.expires > Date.now();
};

export const getGitHubCopilotAvailableModels = async (
	credentials?: GitHubCopilotCredentials | null,
	forceRefresh = false,
): Promise<string[]> => {
	const resolvedCredentials = credentials || (await getValidGitHubCopilotCredentials());
	if (!resolvedCredentials) return [];
	return fetchCopilotModelsByToken(resolvedCredentials.access, resolvedCredentials.enterpriseDomain, forceRefresh);
};

export const resolveGitHubCopilotModel = async (
	requestedModel: string,
	credentials?: GitHubCopilotCredentials | null,
	availableModelsHint?: string[],
): Promise<{ model: string; availableModels: string[] }> => {
	const normalizedRequested = normalizeModelId(requestedModel);
	const availableModels = Array.isArray(availableModelsHint)
		? availableModelsHint.map((model) => normalizeModelId(model)).filter(Boolean)
		: await getGitHubCopilotAvailableModels(credentials);

	if (availableModels.length === 0) {
		return { model: normalizedRequested || requestedModel, availableModels: [] };
	}
	const resolvedModel = selectBestCopilotModel(normalizedRequested || requestedModel, availableModels);
	return { model: resolvedModel, availableModels };
};

export const getValidGitHubCopilotCredentials = async (): Promise<GitHubCopilotCredentials | null> => {
	const credentials = getGitHubCopilotCredentials();
	if (!credentials) return null;
	const stillValid = credentials.expires > Date.now() + 30_000;
	if (stillValid) return credentials;
	try {
		const refreshed = await refreshGitHubCopilotToken(credentials.refresh, credentials.enterpriseDomain);
		setGitHubCopilotCredentials(refreshed);
		return refreshed;
	} catch {
		clearGitHubCopilotCredentials();
		return null;
	}
};

export const loginGitHubCopilot = async (options?: {
	enterpriseDomain?: string;
	onAuth?: (payload: { url: string; userCode: string }) => void;
	onProgress?: (message: string) => void;
	signal?: AbortSignal;
}): Promise<GitHubCopilotCredentials> => {
	const candidateDomain = normalizeDomain(options?.enterpriseDomain || "");
	const domain = candidateDomain || "github.com";

	options?.onProgress?.("Requesting device code...");
	const deviceFlow = await startDeviceFlow(domain);
	options?.onAuth?.({
		url: deviceFlow.verification_uri_complete || deviceFlow.verification_uri,
		userCode: deviceFlow.user_code,
	});

	options?.onProgress?.("Waiting for GitHub authorization...");
	const githubAccessToken = await pollForGitHubAccessToken(
		domain,
		deviceFlow.device_code,
		deviceFlow.interval,
		deviceFlow.expires_in,
		options?.signal,
	);

	options?.onProgress?.("Exchanging Copilot token...");
	const credentials = await refreshGitHubCopilotToken(githubAccessToken, candidateDomain || undefined);
	setGitHubCopilotCredentials(credentials);

	options?.onProgress?.("Enabling selected models...");
	await enablePreferredModels(credentials.access, credentials.enterpriseDomain, options?.onProgress);
	options?.onProgress?.("GitHub Copilot connected");
	return credentials;
};

export const testGitHubCopilotConnection = async (): Promise<{ ok: boolean; error?: string }> => {
	try {
		const credentials = await getValidGitHubCopilotCredentials();
		if (!credentials) return { ok: false, error: "Not authenticated" };
		const models = await getGitHubCopilotAvailableModels(credentials, true);
		if (models.length === 0) {
			return { ok: false, error: "No model returned by Copilot endpoint" };
		}
		return { ok: true };
	} catch (error: any) {
		return { ok: false, error: error?.message || "Connection failed" };
	}
};

const inferInitiator = (messages: CopilotChatMessage[]): "user" | "agent" => {
	const last = messages[messages.length - 1];
	return last && last.role !== "user" ? "agent" : "user";
};

const hasCopilotVisionInput = (messages: CopilotChatMessage[]): boolean => {
	return messages.some((message) => {
		if (message.role !== "user" || !Array.isArray(message.content)) return false;
		return message.content.some((part) => {
			return part?.type === "image_url" && typeof part?.image_url?.url === "string" && part.image_url.url.length > 0;
		});
	});
};

export const chatWithGitHubCopilotStreaming = (
	options: {
		model: string;
		messages: CopilotChatMessage[];
	},
	onEvent: (event: GitHubCopilotStreamEvent) => void,
): GitHubCopilotStreamHandle => {
	const controller = new AbortController();

	(async () => {
		try {
			const credentials = await getValidGitHubCopilotCredentials();
			if (!credentials) {
				onEvent({ event: "error", message: "GitHub Copilot not authenticated" });
				return;
			}

			const resolvedModel = await resolveGitHubCopilotModel(options.model, credentials);
			const baseUrl = getGitHubCopilotBaseUrl(credentials.access, credentials.enterpriseDomain);
			const needsVision = hasCopilotVisionInput(options.messages);
			const { response: res, errorText } = await fetchCopilotWithIntegrationFallback(`${baseUrl}/chat/completions`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${credentials.access}`,
					"Content-Type": "application/json",
					...COPILOT_HEADERS,
					"X-Initiator": inferInitiator(options.messages),
					"Openai-Intent": "conversation-edits",
					...(needsVision ? { "Copilot-Vision-Request": "true" } : {}),
				},
				body: JSON.stringify({
					model: resolvedModel.model || options.model,
					stream: true,
					messages: options.messages.map((message) => ({
						role: message.role,
						content: Array.isArray(message.content) ? message.content : String(message.content || ""),
					})),
				}),
				signal: controller.signal,
			});

			if (!res.ok || !res.body) {
				const text = errorText || (await res.text().catch(() => ""));
				onEvent({ event: "error", message: `${res.status} ${res.statusText} ${text}`.trim() });
				return;
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder("utf-8");
			let buffer = "";
			let ended = false;

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });

				let splitIndex = buffer.indexOf("\n\n");
				while (splitIndex !== -1) {
					const chunk = buffer.slice(0, splitIndex);
					buffer = buffer.slice(splitIndex + 2);
					splitIndex = buffer.indexOf("\n\n");

					const payloadLine = chunk
						.split("\n")
						.map((line) => line.trim())
						.find((line) => line.startsWith("data: "));
					if (!payloadLine) continue;
					const raw = payloadLine.replace(/^data:\s*/, "");
					if (!raw || raw === "[DONE]") {
						if (!ended) {
							ended = true;
							onEvent({ event: "message_end" });
						}
						continue;
					}

					try {
						const data = JSON.parse(raw);
						const delta = data?.choices?.[0]?.delta?.content;
						if (typeof delta === "string" && delta) {
							onEvent({ event: "message", answer: delta });
							continue;
						}
						if (Array.isArray(delta)) {
							const text = delta.map((part: any) => (typeof part?.text === "string" ? part.text : "")).join("");
							if (text) onEvent({ event: "message", answer: text });
							continue;
						}
						const fallback = data?.choices?.[0]?.message?.content;
						if (typeof fallback === "string" && fallback) {
							onEvent({ event: "message", answer: fallback });
						}
					} catch {
						// ignore malformed chunks
					}
				}
			}

			if (!ended) {
				onEvent({ event: "message_end" });
			}
		} catch (error: any) {
			if (error?.name === "AbortError") return;
			onEvent({ event: "error", message: error?.message || "GitHub Copilot request failed" });
		}
	})();

	return {
		stop: async () => {
			controller.abort();
		},
		abort: () => controller.abort(),
	};
};
