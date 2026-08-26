# Provider audit

Moros uses Pi's provider registry from `@earendil-works/pi-ai` and the auth/model
resolution layer from `@earendil-works/pi-coding-agent`.

## Commands

```bash
npm run audit:providers:static
npm run audit:providers
npm run audit:providers -- --live
npm run audit:providers:strict-live
npm run audit:providers -- --provider=openai
npm run audit:providers -- --timeout-ms=15000
```

- `audit:providers:static` checks model metadata and API registration only. It
  does not call external endpoints and is safe for CI.
  It also fails if Pi exposes a provider without a matching Moros credential
  hint, or if Moros keeps a stale hint for a provider Pi no longer exposes.
- `audit:providers` also probes concrete HTTPS base URLs without credentials.
  HTTP `401`, `403`, `404`, `405`, and redirects still prove that the service
  endpoint is reachable.
- `--live` sends one tiny request per configured provider. This may consume
  provider quota and is skipped when no credential is configured.
- `audit:providers:strict-live` is the final proof command for provider
  readiness. It fails unless every selected provider has a passing live request.
  When a provider is skipped, the console output includes the expected
  credential source to configure next.

## Credential sources

Pi resolves credentials with these ownership rules:

1. An explicit request/runtime API-key override wins.
2. A stored API-key or OAuth credential under `~/.pi/agent/auth.json` owns that
   provider. A failed refresh or mismatched stored credential does not silently
   fall back to ambient environment credentials.
3. Only when no credential is stored does the provider resolve ambient sources
   such as environment variables, AWS credentials, or Google ADC.
4. `~/.pi/agent/models.json` can compose custom provider/model configuration;
   it is not a universal final API-key fallback.

## Provider environment variable examples

This table is a convenience snapshot, not the provider catalog. The current
source of truth is `src/shared/provider-auth-registry.json`, checked against
the pinned Pi catalog by `npm run audit:providers:static`.

| Provider | Environment variables |
| --- | --- |
| `amazon-bedrock` | `AWS_PROFILE`, or `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`, or `AWS_BEARER_TOKEN_BEDROCK`, or ECS/IRSA credential vars |
| `anthropic` | Pi OAuth login, `ANTHROPIC_OAUTH_TOKEN`, `ANTHROPIC_API_KEY` |
| `azure-openai-responses` | `AZURE_OPENAI_API_KEY` |
| `cerebras` | `CEREBRAS_API_KEY` |
| `cloudflare-ai-gateway` | `CLOUDFLARE_API_KEY` |
| `cloudflare-workers-ai` | `CLOUDFLARE_API_KEY` |
| `deepseek` | `DEEPSEEK_API_KEY` |
| `fireworks` | `FIREWORKS_API_KEY` |
| `github-copilot` | Pi OAuth login, `COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, `GITHUB_TOKEN` |
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
| `openai-codex` | Pi OAuth login for ChatGPT/Codex subscription |
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

Moros hides models that have credentials but are missing required
provider-specific configuration, so the model picker does not offer a model
that is known to fail before the request is sent.
