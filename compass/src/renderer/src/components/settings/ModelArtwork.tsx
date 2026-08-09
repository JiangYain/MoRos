import AnthropicIcon from "@lobehub/icons/es/Anthropic/components/Mono";
import AntGroupIcon from "@lobehub/icons/es/AntGroup/components/Color";
import AzureAIIcon from "@lobehub/icons/es/AzureAI/components/Color";
import BedrockIcon from "@lobehub/icons/es/Bedrock/components/Color";
import CerebrasIcon from "@lobehub/icons/es/Cerebras/components/Color";
import ClaudeIcon from "@lobehub/icons/es/Claude/components/Color";
import CloudflareIcon from "@lobehub/icons/es/Cloudflare/components/Color";
import CodexIcon from "@lobehub/icons/es/Codex/components/Color";
import DeepSeekIcon from "@lobehub/icons/es/DeepSeek/components/Color";
import FireworksIcon from "@lobehub/icons/es/Fireworks/components/Color";
import GeminiIcon from "@lobehub/icons/es/Gemini/components/Color";
import GithubCopilotIcon from "@lobehub/icons/es/GithubCopilot/components/Mono";
import GrokIcon from "@lobehub/icons/es/Grok/components/Mono";
import GroqIcon from "@lobehub/icons/es/Groq/components/Mono";
import HuggingFaceIcon from "@lobehub/icons/es/HuggingFace/components/Color";
import KimiIcon from "@lobehub/icons/es/Kimi/components/Mono";
import MetaIcon from "@lobehub/icons/es/Meta/components/Color";
import MicrosoftIcon from "@lobehub/icons/es/Microsoft/components/Color";
import MinimaxIcon from "@lobehub/icons/es/Minimax/components/Color";
import MistralIcon from "@lobehub/icons/es/Mistral/components/Color";
import MoonshotIcon from "@lobehub/icons/es/Moonshot/components/Mono";
import NvidiaIcon from "@lobehub/icons/es/Nvidia/components/Color";
import OpenCodeIcon from "@lobehub/icons/es/OpenCode/components/Mono";
import OpenAIIcon from "@lobehub/icons/es/OpenAI/components/Mono";
import OpenRouterIcon from "@lobehub/icons/es/OpenRouter/components/Mono";
import QwenIcon from "@lobehub/icons/es/Qwen/components/Color";
import TogetherIcon from "@lobehub/icons/es/Together/components/Color";
import VercelIcon from "@lobehub/icons/es/Vercel/components/Mono";
import VertexAIIcon from "@lobehub/icons/es/VertexAI/components/Color";
import WorkersAIIcon from "@lobehub/icons/es/WorkersAI/components/Color";
import XAIIcon from "@lobehub/icons/es/XAI/components/Mono";
import XiaomiMiMoIcon from "@lobehub/icons/es/XiaomiMiMo/components/Mono";
import ZAIIcon from "@lobehub/icons/es/ZAI/components/Mono";
import { Box } from "lucide-react";

export function ModelBrandIcon({ model, provider, size = 19 }: { model: string; provider: string; size?: number }): React.JSX.Element {
  const identity = `${model} ${provider}`.toLowerCase();
  if (/claude|sonnet|opus|haiku/.test(identity)) return <ClaudeIcon size={size} />;
  if (/gemini|gemma/.test(identity)) return <GeminiIcon size={size} />;
  if (/gpt-|\bgpt\b|openai|\bo[134]-/.test(identity)) return <OpenAIIcon size={size} />;
  if (/deepseek/.test(identity)) return <DeepSeekIcon size={size} />;
  if (/grok|\bxai\b/.test(identity)) return <GrokIcon size={size} />;
  if (/qwen/.test(identity)) return <QwenIcon size={size} />;
  if (/llama|\bmeta\b/.test(identity)) return <MetaIcon size={size} />;
  if (/mistral|mixtral/.test(identity)) return <MistralIcon size={size} />;
  if (/kimi/.test(identity)) return <KimiIcon size={size} />;
  if (/mai-|microsoft/.test(identity)) return <MicrosoftIcon size={size} />;
  if (/copilot|github/.test(identity)) return <GithubCopilotIcon size={size} />;
  return <Box size={size - 1} strokeWidth={1.45} />;
}

const PROVIDER_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  "amazon-bedrock": BedrockIcon,
  "ant-ling": AntGroupIcon,
  anthropic: AnthropicIcon,
  "azure-openai-responses": AzureAIIcon,
  cerebras: CerebrasIcon,
  "cloudflare-ai-gateway": CloudflareIcon,
  "cloudflare-workers-ai": WorkersAIIcon,
  deepseek: DeepSeekIcon,
  fireworks: FireworksIcon,
  "github-copilot": GithubCopilotIcon,
  google: GeminiIcon,
  "google-vertex": VertexAIIcon,
  groq: GroqIcon,
  huggingface: HuggingFaceIcon,
  "kimi-coding": KimiIcon,
  minimax: MinimaxIcon,
  "minimax-cn": MinimaxIcon,
  mistral: MistralIcon,
  moonshotai: MoonshotIcon,
  "moonshotai-cn": MoonshotIcon,
  nvidia: NvidiaIcon,
  openai: OpenAIIcon,
  "openai-codex": CodexIcon,
  opencode: OpenCodeIcon,
  "opencode-go": OpenCodeIcon,
  openrouter: OpenRouterIcon,
  together: TogetherIcon,
  "vercel-ai-gateway": VercelIcon,
  xai: XAIIcon,
  xiaomi: XiaomiMiMoIcon,
  "xiaomi-token-plan-ams": XiaomiMiMoIcon,
  "xiaomi-token-plan-cn": XiaomiMiMoIcon,
  "xiaomi-token-plan-sgp": XiaomiMiMoIcon,
  zai: ZAIIcon,
  "zai-coding-cn": ZAIIcon,
};

export function ProviderBrandIcon({ provider, size = 18 }: { provider: string; size?: number }): React.JSX.Element {
  const Icon = PROVIDER_ICONS[provider.toLowerCase()];
  return Icon ? <Icon size={size} /> : <Box size={size - 1} strokeWidth={1.45} />;
}
