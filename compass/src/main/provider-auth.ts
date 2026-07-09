export interface ProviderAuthInfo {
  supportsApiKey: boolean;
  supportsOAuth?: boolean;
  envVars: string[];
  requiredEnv: string[];
  authNote?: string;
}

import providerAuthRegistry from "@shared/provider-auth-registry.json";

const PROVIDER_AUTH_REGISTRY = providerAuthRegistry as Record<string, ProviderAuthInfo>;

export function getProviderAuthInfo(provider: string, supportsOAuth: boolean): ProviderAuthInfo {
  const configured = PROVIDER_AUTH_REGISTRY[provider];
  if (configured) {
    return {
      ...configured,
      envVars: [...configured.envVars],
      requiredEnv: [...configured.requiredEnv],
      supportsOAuth: supportsOAuth || Boolean(configured.supportsOAuth),
    };
  }
  return {
    supportsApiKey: true,
    supportsOAuth,
    envVars: [],
    requiredEnv: [],
  };
}

export function getProviderConfigurationIssue(
  provider: string,
  models: Array<{ baseUrl?: string }>,
): string | undefined {
  const baseUrls = models.map((model) => model.baseUrl ?? "");

  if (
    provider === "azure-openai-responses" &&
    baseUrls.some((baseUrl) => baseUrl.trim().length === 0) &&
    !process.env.AZURE_OPENAI_BASE_URL?.trim() &&
    !process.env.AZURE_OPENAI_RESOURCE_NAME?.trim()
  ) {
    return "Set AZURE_OPENAI_BASE_URL or AZURE_OPENAI_RESOURCE_NAME.";
  }

  if (baseUrls.some((baseUrl) => baseUrl.includes("{CLOUDFLARE_ACCOUNT_ID}"))) {
    const missing = ["CLOUDFLARE_ACCOUNT_ID"].filter((name) => !process.env[name]?.trim());
    if (
      baseUrls.some((baseUrl) => baseUrl.includes("{CLOUDFLARE_GATEWAY_ID}")) &&
      !process.env.CLOUDFLARE_GATEWAY_ID?.trim()
    ) {
      missing.push("CLOUDFLARE_GATEWAY_ID");
    }
    if (missing.length > 0) {
      return `Set ${missing.join(" and ")}.`;
    }
  }

  return undefined;
}
