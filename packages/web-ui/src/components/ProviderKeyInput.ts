import { i18n } from "@mariozechner/mini-lit";
import { Badge } from "@mariozechner/mini-lit/dist/Badge.js";
import { Button } from "@mariozechner/mini-lit/dist/Button.js";
import PromptDialog from "@mariozechner/mini-lit/dist/PromptDialog.js";
import { type Context, complete, getModel, loginGitHubCopilot, type OAuthCredentials } from "@mariozechner/pi-ai";
import { html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { getAppStorage } from "../storage/app-storage.js";
import { applyProxyIfNeeded } from "../utils/proxy-utils.js";
import { Input } from "./Input.js";

// Test models for each provider
const TEST_MODELS: Record<string, string> = {
	anthropic: "claude-3-5-haiku-20241022",
	openai: "gpt-4o-mini",
	google: "gemini-2.5-flash",
	groq: "openai/gpt-oss-20b",
	openrouter: "z-ai/glm-4.6",
	"vercel-ai-gateway": "anthropic/claude-opus-4.5",
	cerebras: "gpt-oss-120b",
	xai: "grok-4-fast-non-reasoning",
	zai: "glm-4.5-air",
};

@customElement("provider-key-input")
export class ProviderKeyInput extends LitElement {
	@property() provider = "";
	@state() private keyInput = "";
	@state() private testing = false;
	@state() private failed = false;
	@state() private hasKey = false;
	@state() private inputChanged = false;
	@state() private oauthLoggedIn = false;
	@state() private oauthLoading = false;
	@state() private oauthStatus = "";
	@state() private oauthError = "";
	@state() private oauthDeviceCode = "";

	protected createRenderRoot() {
		return this;
	}

	override async connectedCallback() {
		super.connectedCallback();
		await this.checkKeyStatus();
	}

	private async checkKeyStatus() {
		try {
			const storage = getAppStorage();
			const key = await storage.providerKeys.get(this.provider);
			const oauthCredentials = await storage.oauthCredentials?.get(this.provider);
			this.hasKey = !!key || !!oauthCredentials;
			this.oauthLoggedIn = !!oauthCredentials;
		} catch (error) {
			console.error("Failed to check key status:", error);
		}
	}

	private async persistOAuthCredentials(credentials: OAuthCredentials) {
		const storage = getAppStorage();
		await storage.oauthCredentials?.set(this.provider, credentials);
		await storage.providerKeys.set(this.provider, credentials.access);
	}

	private isFetchFailure(error: unknown): boolean {
		return error instanceof Error && error.message.toLowerCase().includes("failed to fetch");
	}

	private async getConfiguredProxyUrl(): Promise<string | undefined> {
		const storage = getAppStorage();
		const enabled = await storage.settings.get<boolean>("proxy.enabled");
		const proxyUrl = await storage.settings.get<string>("proxy.url");
		if (!enabled || !proxyUrl) {
			return undefined;
		}
		return proxyUrl.replace(/\/$/, "");
	}

	private async runCopilotOAuthFlowWithOptionalProxy(
		proxyUrl?: string,
		promptAnswers?: Map<string, string>,
	): Promise<OAuthCredentials> {
		const runLogin = async () =>
			loginGitHubCopilot({
				onAuth: (url: string, instructions?: string) => {
					const code = this.extractDeviceCode(instructions);
					this.oauthDeviceCode = code ?? "";
					this.oauthStatus = code
						? `Device code: ${code}. Complete authentication in your browser.`
						: instructions
							? `${instructions} Complete authentication in your browser.`
							: "Complete authentication in your browser.";
					window.open(url, "_blank", "noopener,noreferrer");
				},
				onPrompt: async (prompt: { message: string; placeholder?: string; allowEmpty?: boolean }) => {
					const promptKey = `${prompt.message}|${prompt.placeholder || ""}|${prompt.allowEmpty ? "1" : "0"}`;
					const cachedAnswer = promptAnswers?.get(promptKey);
					if (cachedAnswer !== undefined) {
						return cachedAnswer;
					}

					const value = await PromptDialog.ask(
						"GitHub Copilot OAuth",
						prompt.placeholder ? `${prompt.message} (e.g. ${prompt.placeholder})` : prompt.message,
						"",
						prompt.allowEmpty ?? false,
					);
					if (value === undefined || value === null) {
						throw new Error("Login cancelled");
					}
					const trimmed = value.trim();
					if (!trimmed && !prompt.allowEmpty) {
						throw new Error("Login cancelled");
					}
					promptAnswers?.set(promptKey, trimmed);
					return trimmed;
				},
				onProgress: (message: string) => {
					this.oauthStatus = message;
				},
			});

		if (!proxyUrl) {
			return runLogin();
		}

		const originalFetch = globalThis.fetch.bind(globalThis);
		const shouldProxy = (url: string) =>
			url.startsWith("https://github.com/") ||
			url.startsWith("https://api.github.com/") ||
			url.startsWith("https://copilot-api.") ||
			url.includes(".githubcopilot.com");

		const proxiedFetch: typeof fetch = async (input, init) => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
			if (!shouldProxy(url)) {
				return originalFetch(input, init);
			}
			return originalFetch(`${proxyUrl}/?url=${encodeURIComponent(url)}`, init);
		};

		try {
			globalThis.fetch = proxiedFetch;
			return await runLogin();
		} finally {
			globalThis.fetch = originalFetch;
		}
	}

	private extractDeviceCode(instructions?: string): string | null {
		if (!instructions) return null;
		const match = instructions.match(/([A-Z0-9]{4}-[A-Z0-9]{4})/i);
		return match ? match[1].toUpperCase() : null;
	}

	private async copyDeviceCode() {
		if (!this.oauthDeviceCode) return;
		try {
			await navigator.clipboard.writeText(this.oauthDeviceCode);
			this.oauthStatus = `Device code copied: ${this.oauthDeviceCode}`;
		} catch {
			this.oauthStatus = `Copy failed. Device code: ${this.oauthDeviceCode}`;
		}
	}

	private async loginWithGitHubCopilot() {
		if (this.provider !== "github-copilot") {
			return;
		}

		this.oauthLoading = true;
		this.oauthError = "";
		this.oauthStatus = "Starting OAuth login...";
		this.oauthDeviceCode = "";

		try {
			let credentials: OAuthCredentials;
			const promptAnswers = new Map<string, string>();
			const proxyUrl = await this.getConfiguredProxyUrl();
			if (proxyUrl) {
				this.oauthStatus = "Using configured proxy for OAuth login...";
				credentials = await this.runCopilotOAuthFlowWithOptionalProxy(proxyUrl, promptAnswers);
			} else {
				try {
					credentials = await this.runCopilotOAuthFlowWithOptionalProxy(undefined, promptAnswers);
				} catch (error) {
					if (!this.isFetchFailure(error)) {
						throw error;
					}

					throw new Error("OAuth request was blocked (network/CORS). Enable Proxy in Settings and retry.");
				}
			}

			await this.persistOAuthCredentials(credentials);
			await this.checkKeyStatus();
			this.oauthStatus = "OAuth login successful.";
			this.oauthDeviceCode = "";
			this.inputChanged = false;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (message !== "Login cancelled") {
				this.oauthError = message;
				this.failed = true;
				setTimeout(() => {
					this.failed = false;
					this.requestUpdate();
				}, 5000);
			}
		} finally {
			this.oauthLoading = false;
		}
	}

	private async logoutGitHubCopilot() {
		if (this.provider !== "github-copilot") {
			return;
		}
		try {
			const storage = getAppStorage();
			await storage.oauthCredentials?.delete(this.provider);
			await storage.providerKeys.delete(this.provider);
			this.keyInput = "";
			this.inputChanged = false;
			this.oauthStatus = "Logged out.";
			this.oauthError = "";
			this.oauthDeviceCode = "";
			await this.checkKeyStatus();
		} catch (error) {
			this.oauthError = error instanceof Error ? error.message : String(error);
		}
	}

	private async testApiKey(provider: string, apiKey: string): Promise<boolean> {
		try {
			const modelId = TEST_MODELS[provider];
			// Returning true here for Ollama and friends. Can' know which model to use for testing
			if (!modelId) return true;

			let model = getModel(provider as any, modelId);
			if (!model) return false;

			// Get proxy URL from settings (if available)
			const proxyEnabled = await getAppStorage().settings.get<boolean>("proxy.enabled");
			const proxyUrl = await getAppStorage().settings.get<string>("proxy.url");

			// Apply proxy only if this provider/key combination requires it
			model = applyProxyIfNeeded(model, apiKey, proxyEnabled ? proxyUrl || undefined : undefined);

			const context: Context = {
				messages: [{ role: "user", content: "Reply with: ok", timestamp: Date.now() }],
			};

			const result = await complete(model, context, {
				apiKey,
				maxTokens: 200,
			} as any);

			return result.stopReason === "stop";
		} catch (error) {
			console.error(`API key test failed for ${provider}:`, error);
			return false;
		}
	}

	private async saveKey() {
		if (!this.keyInput) return;

		this.testing = true;
		this.failed = false;

		const success = await this.testApiKey(this.provider, this.keyInput);

		this.testing = false;

		if (success) {
			try {
				await getAppStorage().providerKeys.set(this.provider, this.keyInput);
				this.hasKey = true;
				this.inputChanged = false;
				this.requestUpdate();
			} catch (error) {
				console.error("Failed to save API key:", error);
				this.failed = true;
				setTimeout(() => {
					this.failed = false;
					this.requestUpdate();
				}, 5000);
			}
		} else {
			this.failed = true;
			setTimeout(() => {
				this.failed = false;
				this.requestUpdate();
			}, 5000);
		}
	}

	render() {
		return html`
			<div class="space-y-3">
				<div class="flex items-center gap-2">
					<span class="text-sm font-medium capitalize text-foreground">${this.provider}</span>
					${
						this.testing
							? Badge({ children: i18n("Testing..."), variant: "secondary" })
							: this.hasKey
								? html`<span class="text-green-600 dark:text-green-400">✓</span>`
								: ""
					}
					${this.failed ? Badge({ children: i18n("✗ Invalid"), variant: "destructive" }) : ""}
				</div>
				${
					this.provider === "github-copilot"
						? html`
							<div class="space-y-2 rounded-md border border-border p-3">
								<p class="text-xs text-muted-foreground">
									Use your GitHub Copilot subscription with OAuth (no API key needed).
								</p>
								<div class="flex items-center gap-2">
									${Button({
										onClick: () => this.loginWithGitHubCopilot(),
										variant: "default",
										size: "sm",
										disabled: this.oauthLoading,
										children: this.oauthLoading ? "Logging in..." : "Login with GitHub",
									})}
									${
										this.oauthLoggedIn
											? Button({
													onClick: () => this.logoutGitHubCopilot(),
													variant: "outline",
													size: "sm",
													disabled: this.oauthLoading,
													children: "Logout",
												})
											: ""
									}
								</div>
								${
									this.oauthDeviceCode
										? html`
											<div class="flex items-center gap-2 rounded border border-border bg-secondary/30 px-2 py-1">
												<code class="text-xs font-mono text-foreground">${this.oauthDeviceCode}</code>
												${Button({
													onClick: () => this.copyDeviceCode(),
													variant: "outline",
													size: "sm",
													children: "Copy code",
												})}
											</div>
										`
										: ""
								}
								${this.oauthStatus ? html`<p class="text-xs text-muted-foreground">${this.oauthStatus}</p>` : ""}
								${this.oauthError ? html`<p class="text-xs text-red-500">${this.oauthError}</p>` : ""}
							</div>
						`
						: html`
							<div class="flex items-center gap-2">
								${Input({
									type: "password",
									placeholder: this.hasKey ? "••••••••••••" : i18n("Enter API key"),
									value: this.keyInput,
									onInput: (e: Event) => {
										this.keyInput = (e.target as HTMLInputElement).value;
										this.inputChanged = true;
										this.requestUpdate();
									},
									className: "flex-1",
								})}
								${Button({
									onClick: () => this.saveKey(),
									variant: "default",
									size: "sm",
									disabled: !this.keyInput || this.testing || (this.hasKey && !this.inputChanged),
									children: i18n("Save"),
								})}
							</div>
						`
				}
			</div>
		`;
	}
}
