import type { OAuthCredentials } from "@mariozechner/pi-ai";
import { Store } from "../store.js";
import type { StoreConfig } from "../types.js";

/**
 * Store for OAuth credentials (refresh/access tokens + expiry).
 */
export class OAuthCredentialsStore extends Store {
	getConfig(): StoreConfig {
		return {
			name: "oauth-credentials",
		};
	}

	async get(provider: string): Promise<OAuthCredentials | null> {
		return this.getBackend().get("oauth-credentials", provider);
	}

	async set(provider: string, credentials: OAuthCredentials): Promise<void> {
		await this.getBackend().set("oauth-credentials", provider, credentials);
	}

	async delete(provider: string): Promise<void> {
		await this.getBackend().delete("oauth-credentials", provider);
	}

	async has(provider: string): Promise<boolean> {
		return this.getBackend().has("oauth-credentials", provider);
	}
}
