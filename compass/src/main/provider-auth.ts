export interface ProviderAuthInfo {
  supportsApiKey: boolean;
  supportsOAuth?: boolean;
  envVars: string[];
  requiredEnv: string[];
  authNote?: string;
}

const API_KEY_PROVIDERS: Record<string, { envVars: string[]; requiredEnv?: string[]; note?: string }> = {
  anthropic: { envVars: ["ANTHROPIC_API_KEY", "ANTHROPIC_OAUTH_TOKEN"] },
  "azure-openai-responses": {
    envVars: ["AZURE_OPENAI_API_KEY"],
    requiredEnv: ["AZURE_OPENAI_BASE_URL or AZURE_OPENAI_RESOURCE_NAME"],
  },
  openai: { envVars: ["OPENAI_API_KEY"] },
  deepseek: { envVars: ["DEEPSEEK_API_KEY"] },
  google: { envVars: ["GEMINI_API_KEY"] },
  "google-vertex": {
    envVars: ["GOOGLE_CLOUD_API_KEY"],
    requiredEnv: ["GOOGLE_CLOUD_PROJECT/GCLOUD_PROJECT", "GOOGLE_CLOUD_LOCATION"],
    note: "Also supports Google Application Default Credentials instead of an API key.",
  },
  groq: { envVars: ["GROQ_API_KEY"] },
  cerebras: { envVars: ["CEREBRAS_API_KEY"] },
  "cloudflare-ai-gateway": {
    envVars: ["CLOUDFLARE_API_KEY"],
    requiredEnv: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_GATEWAY_ID"],
  },
  "cloudflare-workers-ai": {
    envVars: ["CLOUDFLARE_API_KEY"],
    requiredEnv: ["CLOUDFLARE_ACCOUNT_ID"],
  },
  xai: { envVars: ["XAI_API_KEY"] },
  openrouter: { envVars: ["OPENROUTER_API_KEY"] },
  "vercel-ai-gateway": { envVars: ["AI_GATEWAY_API_KEY"] },
  zai: { envVars: ["ZAI_API_KEY"] },
  opencode: { envVars: ["OPENCODE_API_KEY"] },
  "opencode-go": { envVars: ["OPENCODE_API_KEY"] },
  huggingface: { envVars: ["HF_TOKEN"] },
  fireworks: { envVars: ["FIREWORKS_API_KEY"] },
  "kimi-coding": { envVars: ["KIMI_API_KEY"] },
  minimax: { envVars: ["MINIMAX_API_KEY"] },
  "minimax-cn": { envVars: ["MINIMAX_CN_API_KEY"] },
  moonshotai: { envVars: ["MOONSHOT_API_KEY"] },
  "moonshotai-cn": { envVars: ["MOONSHOT_API_KEY"] },
  mistral: { envVars: ["MISTRAL_API_KEY"] },
  xiaomi: { envVars: ["XIAOMI_API_KEY"] },
  "xiaomi-token-plan-cn": { envVars: ["XIAOMI_TOKEN_PLAN_CN_API_KEY"] },
  "xiaomi-token-plan-ams": { envVars: ["XIAOMI_TOKEN_PLAN_AMS_API_KEY"] },
  "xiaomi-token-plan-sgp": { envVars: ["XIAOMI_TOKEN_PLAN_SGP_API_KEY"] },
};

const SPECIAL_PROVIDERS: Record<string, ProviderAuthInfo> = {
  "amazon-bedrock": {
    supportsApiKey: false,
    envVars: [
      "AWS_PROFILE",
      "AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY",
      "AWS_BEARER_TOKEN_BEDROCK",
      "AWS_CONTAINER_CREDENTIALS_*",
      "AWS_WEB_IDENTITY_TOKEN_FILE",
    ],
    requiredEnv: [],
    authNote: "Uses the AWS SDK credential chain; do not store a normal API key in auth.json.",
  },
  "github-copilot": {
    supportsApiKey: false,
    supportsOAuth: true,
    envVars: ["COPILOT_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"],
    requiredEnv: [],
    authNote: "Preferred access is GitHub Copilot device-code OAuth.",
  },
  "openai-codex": {
    supportsApiKey: false,
    supportsOAuth: true,
    envVars: [],
    requiredEnv: [],
    authNote: "Requires ChatGPT Plus/Pro OAuth; OpenAI API keys are for the separate OpenAI provider.",
  },
};

export function getProviderAuthInfo(provider: string, supportsOAuth: boolean): ProviderAuthInfo {
  const special = SPECIAL_PROVIDERS[provider];
  if (special) return { ...special, supportsOAuth: supportsOAuth || special.supportsOAuth };

  const apiKey = API_KEY_PROVIDERS[provider];
  return {
    supportsApiKey: true,
    supportsOAuth,
    envVars: apiKey?.envVars ?? [],
    requiredEnv: apiKey?.requiredEnv ?? [],
    authNote: apiKey?.note,
  };
}
