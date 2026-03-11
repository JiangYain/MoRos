const LS_OPENCODE_GO_API_KEY = "moros-opencode-go-api-key";
const LS_OPENCODE_GO_BASE_URL = "moros-opencode-go-base-url";
const DEFAULT_OPENCODE_GO_BASE_URL = "https://opencode.ai/zen/go/v1";
const LOCAL_PROXY_BASE = "http://localhost:53211/api/proxy";
const PROXY_AUTH_HEADER = "x-moros-proxy-token";
const PROXY_AUTH_ENDPOINT = `${LOCAL_PROXY_BASE}/auth-token`;
const PROXY_AUTH_FALLBACK_TTL_MS = 5 * 60 * 1000;

let proxyAuthCache: { token: string; expiresAt: number } | null = null;

const normalizeBaseUrl = (value?: string): string => {
	const normalized = String(value || "")
		.trim()
		.replace(/\/+$/, "");
	return normalized || DEFAULT_OPENCODE_GO_BASE_URL;
};

const resolveOpenCodeGoCompletionsUrl = (baseUrl: string): string => {
	const normalizedBase = normalizeBaseUrl(baseUrl);
	const openaiBase = normalizedBase.endsWith("/v1") ? normalizedBase : `${normalizedBase}/v1`;
	return `${openaiBase}/chat/completions`;
};

const getProxyAuthToken = async (): Promise<string> => {
	const now = Date.now();
	if (proxyAuthCache && proxyAuthCache.expiresAt > now + 1_000) {
		return proxyAuthCache.token;
	}
	const response = await fetch(PROXY_AUTH_ENDPOINT, {
		method: "GET",
		headers: { Accept: "application/json" },
	});
	const payload = await response.json().catch(() => ({}) as any);
	if (!response.ok || payload?.success !== true) {
		throw new Error(String(payload?.error || payload?.message || "Failed to get proxy auth token"));
	}
	const token = String(payload?.data?.token || "").trim();
	if (!token) {
		throw new Error("Proxy auth token is missing");
	}
	const expiresAtRaw = Number(payload?.data?.expiresAt);
	proxyAuthCache = {
		token,
		expiresAt: Number.isFinite(expiresAtRaw) ? expiresAtRaw : now + PROXY_AUTH_FALLBACK_TTL_MS,
	};
	return token;
};

export const getOpenCodeGoApiKey = (): string => {
	try {
		return String(localStorage.getItem(LS_OPENCODE_GO_API_KEY) || "").trim();
	} catch {
		return "";
	}
};

export const setOpenCodeGoApiKey = (value: string): void => {
	try {
		localStorage.setItem(LS_OPENCODE_GO_API_KEY, String(value || "").trim());
	} catch {}
};

export const getOpenCodeGoBaseUrl = (): string => {
	try {
		return normalizeBaseUrl(localStorage.getItem(LS_OPENCODE_GO_BASE_URL) || "");
	} catch {
		return DEFAULT_OPENCODE_GO_BASE_URL;
	}
};

export const setOpenCodeGoBaseUrl = (value: string): void => {
	try {
		localStorage.setItem(LS_OPENCODE_GO_BASE_URL, normalizeBaseUrl(value));
	} catch {}
};

export async function testOpenCodeGoConnection(
	baseUrl?: string,
	apiKey?: string,
): Promise<{ ok: boolean; error?: string }> {
	const normalizedKey = String(apiKey || getOpenCodeGoApiKey()).trim();
	if (!normalizedKey) {
		return { ok: false, error: "Missing OpenCode Go API key" };
	}

	const targetBaseUrl = normalizeBaseUrl(baseUrl || getOpenCodeGoBaseUrl());
	const targetUrl = resolveOpenCodeGoCompletionsUrl(targetBaseUrl);
	const proxyUrl = `${LOCAL_PROXY_BASE}?url=${encodeURIComponent(targetUrl)}`;

	try {
		const proxyToken = await getProxyAuthToken();
		const response = await fetch(proxyUrl, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${normalizedKey}`,
				"Content-Type": "application/json",
				Accept: "application/json",
				[PROXY_AUTH_HEADER]: proxyToken,
			},
			body: JSON.stringify({
				model: "kimi-k2.5",
				max_tokens: 1,
				messages: [{ role: "user", content: "hi" }],
			}),
		});
		if (response.status === 401 || response.status === 403) {
			return { ok: false, error: `${response.status} Unauthorized — API key invalid or expired` };
		}
		if (!response.ok && response.status !== 200) {
			const text = await response.text().catch(() => "");
			const rawReason = text.trim();
			if (rawReason.toLowerCase().includes("<!doctype html")) {
				return {
					ok: false,
					error: `${response.status} ${response.statusText} (upstream returned HTML error page)`,
				};
			}
			if (response.status === 429) {
				return { ok: true };
			}
			if (rawReason) {
				try {
					const parsed = JSON.parse(rawReason);
					const msg = parsed?.error?.message || parsed?.error || parsed?.message;
					if (msg) return { ok: false, error: String(msg) };
				} catch {}
			}
			return { ok: false, error: rawReason || `${response.status} ${response.statusText}` };
		}
		return { ok: true };
	} catch (error: any) {
		return {
			ok: false,
			error: String(error?.message || "OpenCode Go request failed"),
		};
	}
}
