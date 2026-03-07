import { API_BASE } from "./api";

const LS_OPENAI_CODEX_KEY = "moros-openai-codex-oauth";
const OPENAI_CODEX_OAUTH_BASE = `${API_BASE}/openai-codex/oauth`;
const TOKEN_REFRESH_SKEW_MS = 30 * 1000;

type ApiEnvelope<T> = {
	success: boolean;
	data?: T;
	error?: string;
};

export type OpenAICodexCredentials = {
	refresh: string;
	access: string;
	expires: number;
	accountId: string;
	updatedAt: number;
};

type OAuthStartPayload = {
	flowId: string;
	url: string;
	expiresAt: number;
};

type OAuthStatusPayload = {
	status: "pending" | "success" | "error";
	error?: string;
	credentials?: OpenAICodexCredentials;
};

const normalizeCredentials = (value: unknown): OpenAICodexCredentials | null => {
	if (!value || typeof value !== "object") return null;
	const raw = value as Record<string, unknown>;
	const refresh = String(raw.refresh || "").trim();
	const access = String(raw.access || "").trim();
	const accountId = String(raw.accountId || "").trim();
	const expires = Number(raw.expires);
	const updatedAt = Number(raw.updatedAt || Date.now());
	if (!refresh || !access || !accountId || !Number.isFinite(expires)) return null;
	return {
		refresh,
		access,
		accountId,
		expires,
		updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
	};
};

const sleep = (ms: number, signal?: AbortSignal): Promise<void> => {
	return new Promise((resolve, reject) => {
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

const requestApi = async <T>(url: string, init?: RequestInit): Promise<T> => {
	const response = await fetch(url, init);
	const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
	if (!response.ok || !payload?.success) {
		const errorMessage = String(payload?.error || `${response.status} ${response.statusText}`).trim();
		throw new Error(errorMessage || "Request failed");
	}
	return payload.data as T;
};

const cancelOpenAICodexFlow = async (flowId: string) => {
	if (!flowId) return;
	try {
		await requestApi<{ cancelled: boolean }>(`${OPENAI_CODEX_OAUTH_BASE}/cancel`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ flowId }),
		});
	} catch {
		// ignore cancellation errors
	}
};

export const setOpenAICodexCredentials = (credentials: OpenAICodexCredentials) => {
	const normalized = normalizeCredentials(credentials);
	if (!normalized) return;
	try {
		localStorage.setItem(
			LS_OPENAI_CODEX_KEY,
			JSON.stringify({
				...normalized,
				updatedAt: Date.now(),
			}),
		);
	} catch {}
};

export const getOpenAICodexCredentials = (): OpenAICodexCredentials | null => {
	try {
		const raw = localStorage.getItem(LS_OPENAI_CODEX_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		return normalizeCredentials(parsed);
	} catch {
		return null;
	}
};

export const clearOpenAICodexCredentials = () => {
	try {
		localStorage.removeItem(LS_OPENAI_CODEX_KEY);
	} catch {}
};

export const isOpenAICodexAuthorized = (): boolean => {
	const credentials = getOpenAICodexCredentials();
	if (!credentials) return false;
	return credentials.expires > Date.now();
};

export const refreshOpenAICodexToken = async (refreshToken: string): Promise<OpenAICodexCredentials> => {
	const token = String(refreshToken || "").trim();
	if (!token) {
		throw new Error("refreshToken is required");
	}
	const data = await requestApi<OpenAICodexCredentials>(`${OPENAI_CODEX_OAUTH_BASE}/refresh`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ refreshToken: token }),
	});
	const normalized = normalizeCredentials(data);
	if (!normalized) {
		throw new Error("Invalid OpenAI Codex refresh payload");
	}
	const next = { ...normalized, updatedAt: Date.now() };
	setOpenAICodexCredentials(next);
	return next;
};

export const getValidOpenAICodexCredentials = async (): Promise<OpenAICodexCredentials | null> => {
	const current = getOpenAICodexCredentials();
	if (!current) return null;
	if (current.expires > Date.now() + TOKEN_REFRESH_SKEW_MS) return current;
	try {
		const refreshed = await refreshOpenAICodexToken(current.refresh);
		setOpenAICodexCredentials(refreshed);
		return refreshed;
	} catch {
		clearOpenAICodexCredentials();
		return null;
	}
};

export const loginOpenAICodex = async (options?: {
	onAuth?: (payload: { url: string }) => void;
	onProgress?: (message: string) => void;
	signal?: AbortSignal;
	pollIntervalMs?: number;
}): Promise<OpenAICodexCredentials> => {
	const onProgress = options?.onProgress;
	onProgress?.("正在初始化 OpenAI Codex OAuth...");

	const startPayload = await requestApi<OAuthStartPayload>(`${OPENAI_CODEX_OAUTH_BASE}/start`, {
		method: "POST",
	});
	options?.onAuth?.({ url: startPayload.url });
	onProgress?.("已打开授权页面，等待浏览器完成登录...");

	const pollIntervalMs = Math.max(500, Math.floor(Number(options?.pollIntervalMs || 1200)));
	while (true) {
		if (options?.signal?.aborted) {
			await cancelOpenAICodexFlow(startPayload.flowId);
			throw new Error("Login cancelled");
		}

		const statusPayload = await requestApi<OAuthStatusPayload>(
			`${OPENAI_CODEX_OAUTH_BASE}/status/${encodeURIComponent(startPayload.flowId)}`,
		);

		if (statusPayload.status === "success") {
			const normalized = normalizeCredentials(statusPayload.credentials);
			if (!normalized) {
				throw new Error("OpenAI Codex OAuth returned invalid credentials");
			}
			const nextCredentials = { ...normalized, updatedAt: Date.now() };
			setOpenAICodexCredentials(nextCredentials);
			onProgress?.("OpenAI Codex 已连接");
			return nextCredentials;
		}

		if (statusPayload.status === "error") {
			throw new Error(statusPayload.error || "OpenAI Codex OAuth failed");
		}

		try {
			await sleep(pollIntervalMs, options?.signal);
		} catch (error) {
			await cancelOpenAICodexFlow(startPayload.flowId);
			throw error instanceof Error ? error : new Error(String(error));
		}
	}
};

export const testOpenAICodexConnection = async (): Promise<{ ok: boolean; error?: string }> => {
	try {
		const credentials = await getValidOpenAICodexCredentials();
		if (!credentials) {
			return { ok: false, error: "Not authenticated" };
		}
		if (!String(credentials.accountId || "").trim()) {
			return { ok: false, error: "Missing chatgpt_account_id claim" };
		}
		return { ok: true };
	} catch (error: any) {
		return { ok: false, error: error?.message || "Connection failed" };
	}
};
