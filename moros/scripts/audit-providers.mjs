/**
 * Audit Pi providers used by Moros.
 *
 * Default mode checks provider metadata, API registration, auth availability,
 * and HTTPS reachability of concrete base URLs without sending model requests.
 *
 * Use --live to send one tiny request per configured provider. Live mode may
 * consume provider quota and only runs for providers with configured auth.
 *
 * Use --strict-live when proving every provider is really connectable. It
 * enables --live and fails when any provider is skipped or needs config.
 */
import {
  findEnvKeys,
  getApiProvider,
  getApiProviders,
  getModels,
  getProviders,
} from "@earendil-works/pi-ai/compat";
import {
  ModelRegistry,
  ModelRuntime,
  readStoredCredential,
} from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";

const DEFAULT_TIMEOUT_MS = 8000;
const args = new Set(process.argv.slice(2));
const argList = process.argv.slice(2);
const jsonOnly = args.has("--json");
const strictLive = args.has("--strict-live");
const live = args.has("--live") || strictLive;
const probeEndpoints = !args.has("--static") && !args.has("--no-probe");
const timeoutMs =
  Number(argList.find((arg) => arg.startsWith("--timeout-ms="))?.split("=")[1]) ||
  DEFAULT_TIMEOUT_MS;
const providerFilter = argList
  .filter((arg) => arg.startsWith("--provider="))
  .map((arg) => arg.split("=")[1])
  .filter(Boolean);

const modelRuntime = await ModelRuntime.create({ allowModelNetwork: false });
const registry = new ModelRegistry(modelRuntime);
const registeredApis = new Set(getApiProviders().map((provider) => provider.api));
const allRegistryModels = registry.getAll();
const availableModels = registry.getAvailable();
const oauthProviderIds = new Set(
  modelRuntime
    .getProviders()
    .filter((provider) => provider.auth.oauth !== undefined)
    .map((provider) => provider.id),
);
const providerAuthRegistry = JSON.parse(
  readFileSync(new URL("../src/shared/provider-auth-registry.json", import.meta.url), "utf8"),
);

function log(message = "") {
  if (!jsonOnly) {
    console.log(message);
  }
}

function getEnvValue(name) {
  return process.env[name]?.trim();
}

function getUniqueValues(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function getProviderAuthHint(provider) {
  const info = providerAuthRegistry[provider];
  if (info) {
    const hints = [
      ...(info.supportsOAuth ? ["Pi OAuth login"] : []),
      ...(info.envVars ?? []),
      ...(info.requiredEnv ?? []),
    ];
    if (hints.length > 0) {
      return `set ${hints.join(", ")} or store credentials in ~/.pi/auth.json`;
    }
  }
  return "store credentials in ~/.pi/auth.json or configure the provider in ~/.pi/agent/models.json";
}

function hasProviderAuthHint(provider) {
  return Object.hasOwn(providerAuthRegistry, provider);
}

function hasOAuthAuthHint(provider) {
  return !oauthProviderIds.has(provider) || Boolean(providerAuthRegistry[provider]?.supportsOAuth);
}

function getStaleAuthHints(providers) {
  const knownProviders = new Set(providers);
  return Object.keys(providerAuthRegistry).filter((provider) => !knownProviders.has(provider));
}

function replacePlaceholders(url) {
  const missing = new Set();
  const resolved = url.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name) => {
    const value = getEnvValue(name);
    if (!value) {
      missing.add(name);
      return `{${name}}`;
    }
    return value;
  });

  if (missing.size > 0) {
    return {
      kind: "config_required",
      reason: `missing env ${[...missing].join(", ")}`,
      template: url,
    };
  }

  return { kind: "url", url: resolved };
}

function resolveAzureEndpoint() {
  const baseUrl = getEnvValue("AZURE_OPENAI_BASE_URL");
  const resourceName = getEnvValue("AZURE_OPENAI_RESOURCE_NAME");

  if (baseUrl) {
    return [{ kind: "url", url: baseUrl.replace(/\/+$/, "") }];
  }

  if (resourceName) {
    return [{ kind: "url", url: `https://${resourceName}.openai.azure.com/openai/v1` }];
  }

  return [
    {
      kind: "config_required",
      reason: "missing AZURE_OPENAI_BASE_URL or AZURE_OPENAI_RESOURCE_NAME",
    },
  ];
}

function resolveGoogleVertexEndpoint(models) {
  const location = getEnvValue("GOOGLE_CLOUD_LOCATION");
  const baseUrls = getUniqueValues(models.map((model) => model.baseUrl));

  if (!location && baseUrls.some((url) => url.includes("{location}"))) {
    return [
      {
        kind: "config_required",
        reason: "missing GOOGLE_CLOUD_LOCATION for endpoint probe",
      },
    ];
  }

  return baseUrls.map((url) => replacePlaceholders(url.replace(/\{location\}/g, location)));
}

function getEndpointSpecs(provider, models) {
  if (provider === "azure-openai-responses") {
    return resolveAzureEndpoint();
  }

  if (provider === "google-vertex") {
    return resolveGoogleVertexEndpoint(models);
  }

  const baseUrls = getUniqueValues(models.map((model) => model.baseUrl));
  if (baseUrls.length === 0) {
    return [{ kind: "config_required", reason: "no built-in baseUrl" }];
  }

  return baseUrls.map((url) => replacePlaceholders(url));
}

async function fetchOnce(url, method, signal) {
  return fetch(url, {
    method,
    signal,
    redirect: "manual",
    headers: {
      "user-agent": "moros-provider-audit",
    },
  });
}

async function probeEndpoint(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    let response;
    try {
      response = await fetchOnce(url, "HEAD", controller.signal);
    } catch {
      response = await fetchOnce(url, "GET", controller.signal);
    }

    return {
      reachable: true,
      status: response.status,
      statusText: response.statusText,
      ms: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      reachable: false,
      error: error instanceof Error ? error.message : String(error),
      ms: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function hasCredentialScopedCatalog(provider) {
  const credentials = readStoredCredential(provider);
  return provider === "github-copilot" && credentials?.type === "oauth" && Array.isArray(credentials.availableModelIds);
}

function getMissingMetadata(provider, models, { requireRegistryPresence = true } = {}) {
  const missing = [];
  for (const model of models) {
    const fields = ["id", "name", "provider", "api", "contextWindow", "maxTokens", "cost"];

    if (provider !== "azure-openai-responses") {
      fields.push("baseUrl");
    }

    for (const field of fields) {
      if (model[field] === undefined || model[field] === null || model[field] === "") {
        missing.push(`${model.id}:${field}`);
      }
    }

    if (!getApiProvider(model.api)) {
      missing.push(`${model.id}:unregistered-api:${model.api}`);
    }

    if (requireRegistryPresence && !registry.find(provider, model.id)) {
      missing.push(`${model.id}:not-found-in-registry`);
    }
  }
  return missing;
}

function pickLiveModel(provider) {
  const configured = availableModels.filter((model) => model.provider === provider);
  return configured[0];
}

function createLiveContext() {
  return {
    messages: [
      {
        role: "user",
        content: "Reply with exactly: OK",
        timestamp: Date.now(),
      },
    ],
  };
}

async function runLiveProbe(model) {
  const apiProvider = getApiProvider(model.api);
  if (!apiProvider) {
    return { status: "failed", error: `No registered API provider for ${model.api}` };
  }

  const auth = await registry.getApiKeyAndHeaders(model);
  if (!auth.ok) {
    return { status: "skipped", reason: auth.error };
  }

  if (!auth.apiKey) {
    return { status: "skipped", reason: "no API key resolved" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const stream = apiProvider.streamSimple(model, createLiveContext(), {
      apiKey: auth.apiKey,
      headers: auth.headers,
      maxTokens: 8,
      temperature: 0,
      timeoutMs,
      maxRetries: 0,
      signal: controller.signal,
      cacheRetention: "none",
    });

    for await (const event of stream) {
      if (event.type === "done") {
        return {
          status: "passed",
          model: model.id,
          ms: Date.now() - startedAt,
          stopReason: event.reason,
        };
      }

      if (event.type === "error") {
        return {
          status: "failed",
          model: model.id,
          ms: Date.now() - startedAt,
          error: event.error?.errorMessage || event.reason,
        };
      }
    }

    return { status: "failed", model: model.id, error: "stream ended without done/error" };
  } catch (error) {
    return {
      status: "failed",
      model: model.id,
      ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function auditProvider(provider) {
  const models = getModels(provider);
  const registryModels = allRegistryModels.filter((model) => model.provider === provider);
  const availableCount = availableModels.filter((model) => model.provider === provider).length;
  const apis = getUniqueValues(models.map((model) => model.api));
  const baseUrls = getUniqueValues(models.map((model) => model.baseUrl));
  const placeholders = baseUrls.filter((url) => /\{[^}]+\}/.test(url));
  const authStatus = registry.getProviderAuthStatus(provider);
  const missingAuthHint = !hasProviderAuthHint(provider);
  const missingOAuthHint = !hasOAuthAuthHint(provider);
  const credentialScopedCatalog = hasCredentialScopedCatalog(provider);
  const missingMetadata = getMissingMetadata(provider, models, {
    requireRegistryPresence: !credentialScopedCatalog,
  });
  const endpoints = [];

  for (const spec of getEndpointSpecs(provider, models)) {
    if (!probeEndpoints) {
      endpoints.push({ ...spec, probe: { status: "not_run" } });
      continue;
    }

    if (spec.kind !== "url") {
      endpoints.push(spec);
      continue;
    }

    endpoints.push({
      ...spec,
      probe: await probeEndpoint(spec.url),
    });
  }

  const liveModel = pickLiveModel(provider);
  const liveProbe = live
    ? liveModel
      ? await runLiveProbe(liveModel)
      : {
          status: "skipped",
          reason: `no configured auth for provider; ${getProviderAuthHint(provider)}`,
        }
    : { status: "not_run" };

  return {
    provider,
    displayName: registry.getProviderDisplayName(provider),
    models: models.length,
    registryModels: registryModels.length,
    credentialScopedCatalog,
    availableModels: availableCount,
    apis,
    apiRegistered: apis.every((api) => registeredApis.has(api)),
    baseUrls,
    placeholders,
    auth: {
      configured: authStatus.configured === true || availableCount > 0,
      source: authStatus.source,
      envKeysConfigured: findEnvKeys(provider) ?? [],
      supportsOAuth: oauthProviderIds.has(provider),
      hint: getProviderAuthHint(provider),
      missingHint: missingAuthHint,
      missingOAuthHint,
    },
    missingMetadata,
    endpoints,
    liveProbe,
  };
}

function summarizeEndpoint(endpoint) {
  if (endpoint.probe?.status === "not_run") {
    return endpoint.kind === "url" ? `SKIP ${endpoint.url}` : `SKIP ${endpoint.reason}`;
  }
  if (endpoint.kind !== "url") {
    return `CONFIG: ${endpoint.reason}`;
  }
  if (endpoint.probe.reachable) {
    return `${endpoint.probe.status} ${endpoint.url}`;
  }
  return `ERR ${endpoint.probe.error} ${endpoint.url}`;
}

function summarizeLiveProbe(liveProbe) {
  if (liveProbe.status === "not_run") {
    return "not_run";
  }

  const target = liveProbe.model ? `${liveProbe.model}: ` : "";

  if (liveProbe.status === "passed") {
    const elapsed = liveProbe.ms !== undefined ? `, ${liveProbe.ms}ms` : "";
    return `passed(${liveProbe.model}${elapsed})`;
  }

  if (liveProbe.status === "skipped") {
    return `skipped(${target}${liveProbe.reason ?? "no reason"})`;
  }

  if (liveProbe.status === "failed") {
    return `failed(${target}${liveProbe.error ?? "unknown error"})`;
  }

  return String(liveProbe.status);
}

function hasStaticFailure(result) {
  return (
    result.models === 0 ||
    (!result.credentialScopedCatalog && result.registryModels !== result.models) ||
    !result.apiRegistered ||
    result.missingMetadata.length > 0 ||
    result.auth.missingHint ||
    result.auth.missingOAuthHint
  );
}

function hasEndpointFailure(result) {
  return result.endpoints.some(
    (endpoint) =>
      endpoint.kind === "url" &&
      endpoint.probe?.status !== "not_run" &&
      endpoint.probe.reachable !== true,
  );
}

function hasLiveFailure(result) {
  return live && result.liveProbe.status === "failed";
}

function hasStrictLiveFailure(result) {
  return strictLive && result.liveProbe.status !== "passed";
}

const allProviders = getProviders();
const unknownProviderFilters = providerFilter.filter((provider) => !allProviders.includes(provider));
if (unknownProviderFilters.length > 0) {
  log(`Unknown provider filter(s): ${unknownProviderFilters.join(", ")}`);
  log(`Known providers: ${allProviders.join(", ")}`);
  process.exit(1);
}

const providers = allProviders.filter(
  (provider) => providerFilter.length === 0 || providerFilter.includes(provider),
);
const results = [];
const staleAuthHints = getStaleAuthHints(allProviders);

log(
  `Provider audit: ${providers.length} provider(s), live=${live}, strictLive=${strictLive}, ` +
    `probe=${probeEndpoints}, timeout=${timeoutMs}ms`,
);
if (registry.getError()) {
  log(`models.json warning: ${registry.getError()}`);
}

for (const provider of providers) {
  const result = await auditProvider(provider);
  results.push(result);
  log(
    [
      result.provider,
      `models=${result.models}`,
      `available=${result.availableModels}`,
      result.credentialScopedCatalog ? `registry=scoped(${result.registryModels})` : undefined,
      `apis=${result.apis.join(",")}`,
      `endpoints=${result.endpoints.map(summarizeEndpoint).join(" | ")}`,
      result.auth.missingHint ? "authHint=missing" : undefined,
      result.auth.missingOAuthHint ? "oauthHint=missing" : undefined,
      live ? `live=${summarizeLiveProbe(result.liveProbe)}` : undefined,
    ]
      .filter(Boolean)
      .join(" | "),
  );
}

const staticFailures = results.filter(hasStaticFailure);
const hasStaticAuthHintFailure = staleAuthHints.length > 0;
const endpointFailures = results.filter(hasEndpointFailure);
const liveFailures = results.filter(hasLiveFailure);
const strictLiveFailures = results.filter(hasStrictLiveFailure);
const configRequired = results.filter((result) =>
  result.endpoints.some((endpoint) => endpoint.kind === "config_required"),
);

const report = {
  generatedAt: new Date().toISOString(),
  live,
  strictLive,
  probeEndpoints,
  timeoutMs,
  totals: {
    providers: results.length,
    models: results.reduce((sum, result) => sum + result.models, 0),
    availableModels: results.reduce((sum, result) => sum + result.availableModels, 0),
    staticFailures: staticFailures.length,
    staleAuthHints: staleAuthHints.length,
    endpointFailures: endpointFailures.length,
    liveFailures: liveFailures.length,
    strictLiveFailures: strictLiveFailures.length,
    configRequired: configRequired.length,
  },
  registeredApis: [...registeredApis].sort(),
  staleAuthHints,
  registryLoadError: registry.getError(),
  results,
};

if (jsonOnly) {
  console.log(JSON.stringify(report, null, 2));
} else {
  log("");
  log(
    `Summary: providers=${report.totals.providers}, models=${report.totals.models}, ` +
      `available=${report.totals.availableModels}, staticFailures=${report.totals.staticFailures}, ` +
      `staleAuthHints=${report.totals.staleAuthHints}, ` +
      `endpointFailures=${report.totals.endpointFailures}, liveFailures=${report.totals.liveFailures}, ` +
      `strictLiveFailures=${report.totals.strictLiveFailures}, ` +
      `configRequired=${report.totals.configRequired}`,
  );
}

if (
  staticFailures.length > 0 ||
  hasStaticAuthHintFailure ||
  endpointFailures.length > 0 ||
  liveFailures.length > 0 ||
  strictLiveFailures.length > 0
) {
  process.exitCode = 1;
}
