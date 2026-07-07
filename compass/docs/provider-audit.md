# Provider audit

Compass uses Pi's provider registry from `@mariozechner/pi-ai` and the auth/model
resolution layer from `@mariozechner/pi-coding-agent`.

## Commands

```bash
npm run audit:providers:static
npm run audit:providers
npm run audit:providers -- --live
npm run audit:providers -- --provider=openai
npm run audit:providers -- --timeout-ms=15000
```

- `audit:providers:static` checks model metadata and API registration only. It
  does not call external endpoints and is safe for CI.
- `audit:providers` also probes concrete HTTPS base URLs without credentials.
  HTTP `401`, `403`, `404`, `405`, and redirects still prove that the service
  endpoint is reachable.
- `--live` sends one tiny request per configured provider. This may consume
  provider quota and is skipped when no credential is configured.

## Credential sources

Pi resolves credentials in this order:

1. Runtime override.
2. Stored Pi auth data under `~/.pi/auth.json`.
3. OAuth token from Pi auth data.
4. Environment variables.
5. Custom provider fallback from `~/.pi/agent/models.json`.

## Provider environment variables

| Provider | Environment variables |
| --- | --- |
| `amazon-bedrock` | `AWS_PROFILE`, or `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`, or `AWS_BEARER_TOKEN_BEDROCK`, or ECS/IRSA credential vars |
| `anthropic` | `ANTHROPIC_OAUTH_TOKEN`, `ANTHROPIC_API_KEY` |
| `azure-openai-responses` | `AZURE_OPENAI_API_KEY` |
| `cerebras` | `CEREBRAS_API_KEY` |
| `cloudflare-ai-gateway` | `CLOUDFLARE_API_KEY` |
| `cloudflare-workers-ai` | `CLOUDFLARE_API_KEY` |
| `deepseek` | `DEEPSEEK_API_KEY` |
| `fireworks` | `FIREWORKS_API_KEY` |
| `github-copilot` | `COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, `GITHUB_TOKEN` |
| `google` | `GEMINI_API_KEY` |
| `google-vertex` | `GOOGLE_CLOUD_API_KEY`, or Google ADC |
| `groq` | `GROQ_API_KEY` |
| `huggingface` | `HF_TOKEN` |
| `kimi-coding` | `KIMI_API_KEY` |
| `minimax` | `MINIMAX_API_KEY` |
| `minimax-cn` | `MINIMAX_CN_API_KEY` |
| `mistral` | `MISTRAL_API_KEY` |
| `moonshotai` | `MOONSHOT_API_KEY` |
| `moonshotai-cn` | `MOONSHOT_API_KEY` |
| `openai` | `OPENAI_API_KEY` |
| `opencode` | `OPENCODE_API_KEY` |
| `opencode-go` | `OPENCODE_API_KEY` |
| `openrouter` | `OPENROUTER_API_KEY` |
| `vercel-ai-gateway` | `AI_GATEWAY_API_KEY` |
| `xai` | `XAI_API_KEY` |
| `xiaomi` | `XIAOMI_API_KEY` |
| `xiaomi-token-plan-ams` | `XIAOMI_TOKEN_PLAN_AMS_API_KEY` |
| `xiaomi-token-plan-cn` | `XIAOMI_TOKEN_PLAN_CN_API_KEY` |
| `xiaomi-token-plan-sgp` | `XIAOMI_TOKEN_PLAN_SGP_API_KEY` |
| `zai` | `ZAI_API_KEY` |

## Additional provider configuration

Some providers need more than an API key before requests can be reliable:

- `azure-openai-responses`: set `AZURE_OPENAI_BASE_URL` or
  `AZURE_OPENAI_RESOURCE_NAME`. Optional: `AZURE_OPENAI_API_VERSION` and
  `AZURE_OPENAI_DEPLOYMENT_NAME_MAP`.
- `cloudflare-ai-gateway`: set `CLOUDFLARE_ACCOUNT_ID` and
  `CLOUDFLARE_GATEWAY_ID`.
- `cloudflare-workers-ai`: set `CLOUDFLARE_ACCOUNT_ID`.
- `google-vertex`: API-key mode can use `GOOGLE_CLOUD_API_KEY`. ADC mode needs
  application default credentials plus `GOOGLE_CLOUD_PROJECT` or
  `GCLOUD_PROJECT`, and `GOOGLE_CLOUD_LOCATION`. Endpoint probing also needs
  `GOOGLE_CLOUD_LOCATION` to expand the regional hostname.

Compass hides models that have credentials but are missing required
provider-specific configuration, so the model picker does not offer a model
that is known to fail before the request is sent.
