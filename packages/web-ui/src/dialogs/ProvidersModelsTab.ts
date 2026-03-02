import { html, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import "../components/CustomProviderCard.js";
import "../components/ProviderKeyInput.js";
import { getAppStorage } from "../storage/app-storage.js";
import type { AutoDiscoveryProviderType, CustomProvider } from "../storage/stores/custom-providers-store.js";
import { discoverModels } from "../utils/model-discovery.js";
import { SettingsTab } from "./SettingsDialog.js";

const ONLY_PROVIDER = "github-copilot";

@customElement("providers-models-tab")
export class ProvidersModelsTab extends SettingsTab {
	@state() private customProviders: CustomProvider[] = [];
	@state() private providerStatus: Map<
		string,
		{ modelCount: number; status: "connected" | "disconnected" | "checking" }
	> = new Map();

	override async connectedCallback() {
		super.connectedCallback();
		await this.loadCustomProviders();
	}

	private async loadCustomProviders() {
		try {
			const storage = getAppStorage();
			this.customProviders = await storage.customProviders.getAll();

			for (const provider of this.customProviders) {
				const isAutoDiscovery =
					provider.type === "ollama" ||
					provider.type === "llama.cpp" ||
					provider.type === "vllm" ||
					provider.type === "lmstudio";
				if (isAutoDiscovery) {
					this.checkProviderStatus(provider);
				}
			}
		} catch (error) {
			console.error("Failed to load custom providers:", error);
		}
	}

	getTabName(): string {
		return "Providers & Models";
	}

	private async checkProviderStatus(provider: CustomProvider) {
		this.providerStatus.set(provider.id, { modelCount: 0, status: "checking" });
		this.requestUpdate();

		try {
			const models = await discoverModels(
				provider.type as AutoDiscoveryProviderType,
				provider.baseUrl,
				provider.apiKey,
			);

			this.providerStatus.set(provider.id, { modelCount: models.length, status: "connected" });
		} catch (_error) {
			this.providerStatus.set(provider.id, { modelCount: 0, status: "disconnected" });
		}
		this.requestUpdate();
	}

	private renderKnownProviders(): TemplateResult {
		return html`
			<div class="flex flex-col gap-6">
				<div>
					<h3 class="text-sm font-semibold text-foreground mb-2">Provider</h3>
					<p class="text-sm text-muted-foreground mb-4">
						Only GitHub Copilot OAuth is supported in this build. Available models: GPT-5.3-Codex and Claude Sonnet 4.6.
					</p>
				</div>
				<div class="flex flex-col gap-6">
					<provider-key-input .provider=${ONLY_PROVIDER}></provider-key-input>
				</div>
			</div>
		`;
	}

	render(): TemplateResult {
		return this.renderKnownProviders();
	}
}
