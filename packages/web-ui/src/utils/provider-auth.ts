import type { Api, Model, OAuthCredentials } from "@mariozechner/pi-ai";
import { getOAuthProvider } from "@mariozechner/pi-ai/oauth";
import { getAppStorage } from "../storage/app-storage.js";

async function getValidOAuthCredentials(
	provider: string,
	credentials: OAuthCredentials,
): Promise<OAuthCredentials | null> {
	const oauthProvider = getOAuthProvider(provider);
	if (!oauthProvider) {
		return null;
	}

	if (Date.now() < credentials.expires) {
		return credentials;
	}

	const refreshed = await oauthProvider.refreshToken(credentials);
	await getAppStorage().oauthCredentials?.set(provider, refreshed);
	return refreshed;
}

/**
 * Resolve API key for provider, preferring OAuth credentials when available.
 * OAuth credentials are auto-refreshed when expired.
 */
export async function resolveProviderApiKey(provider: string): Promise<string | null> {
	const storage = getAppStorage();
	const oauthCredentials = await storage.oauthCredentials?.get(provider);
	const oauthProvider = getOAuthProvider(provider);

	if (oauthCredentials && oauthProvider) {
		try {
			const validCredentials = await getValidOAuthCredentials(provider, oauthCredentials);
			if (!validCredentials) {
				return storage.providerKeys.get(provider);
			}

			const apiKey = oauthProvider.getApiKey(validCredentials);
			const storedApiKey = await storage.providerKeys.get(provider);
			if (storedApiKey !== apiKey) {
				await storage.providerKeys.set(provider, apiKey);
			}
			return apiKey;
		} catch (error) {
			console.error(`Failed to resolve OAuth credentials for provider "${provider}":`, error);
			return storage.providerKeys.get(provider);
		}
	}

	return storage.providerKeys.get(provider);
}

/**
 * Apply OAuth-specific model overrides (e.g. dynamic baseUrl) if available.
 */
export async function applyOAuthModelOverrides<T extends Api>(model: Model<T>): Promise<Model<T>> {
	const storage = getAppStorage();
	const oauthCredentials = await storage.oauthCredentials?.get(model.provider);
	const oauthProvider = getOAuthProvider(model.provider);
	if (!oauthCredentials || !oauthProvider?.modifyModels) {
		return model;
	}

	try {
		const validCredentials = await getValidOAuthCredentials(model.provider, oauthCredentials);
		if (!validCredentials) {
			return model;
		}
		const updatedModels = oauthProvider.modifyModels([model], validCredentials);
		return (updatedModels[0] as Model<T>) ?? model;
	} catch (error) {
		console.error(`Failed to apply OAuth model overrides for provider "${model.provider}":`, error);
		return model;
	}
}
