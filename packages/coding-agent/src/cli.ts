#!/usr/bin/env node
/**
 * CLI entry point for the refactored coding agent.
 * Uses main.ts with AgentSession and new mode modules.
 *
 * Test with: npx tsx src/cli-new.ts [args...]
 */
process.title = "pi";

import { setBedrockProviderModule } from "@mariozechner/pi-ai";
import * as bedrockProviderExports from "@mariozechner/pi-ai/bedrock-provider";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { main } from "./main.js";

setGlobalDispatcher(new EnvHttpProxyAgent());
const resolvedBedrockProviderModule =
	"bedrockProviderModule" in bedrockProviderExports
		? (
				bedrockProviderExports as {
					bedrockProviderModule: Parameters<typeof setBedrockProviderModule>[0];
				}
			).bedrockProviderModule
		: (bedrockProviderExports as Parameters<typeof setBedrockProviderModule>[0]);
setBedrockProviderModule(resolvedBedrockProviderModule);

main(process.argv.slice(2));
