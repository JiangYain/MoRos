/*
  Dify API 工具（前端直连）
  - 支持流式聊天（/chat-messages, response_mode: streaming）
  - 支持阻塞模式（不默认使用）
  - 支持停止任务（/chat-messages/:task_id/stop）
  - 支持 /info 测试连接

  安全说明：
  出于体验与开发便捷，本工具默认从 localStorage 读取 apiKey 与 baseUrl。
  若需生产级安全方案，请改为后端代理，并将 apiKey 存于后端安全存储。
*/

export type DifyEvent =
	| {
			event: "message";
			answer: string;
			message_id?: string;
			conversation_id?: string;
			task_id?: string;
			created_at?: number;
	  }
	| { event: "message_end"; message_id?: string; conversation_id?: string; metadata?: any }
	| { event: "message_file"; id: string; type: string; belongs_to: string; url: string; conversation_id: string }
	| {
			event: "workflow_started" | "workflow_finished" | "node_started" | "node_finished";
			data: any;
			task_id?: string;
			workflow_run_id?: string;
	  }
	| {
			event: "tts_message" | "tts_message_end";
			audio?: string;
			created_at?: number;
			task_id?: string;
			message_id?: string;
	  }
	| { event: "message_replace"; answer: string; conversation_id?: string }
	| { event: "ping" }
	| { event: "error"; status?: number; code?: string; message: string };

export interface DifyChatOptions {
	query: string;
	inputs?: Record<string, any>;
	conversationId?: string;
	user?: string;
	files?: any[];
	autoGenerateName?: boolean;
}

export interface DifyStreamHandle {
	stop: () => Promise<void>;
	abort: () => void;
}

const LS_KEY_BASE_URL = "markov-dify-base-url";
const LS_KEY_API_KEY = "markov-dify-api-key";

export const getDifyBaseUrl = (): string => {
	const v = localStorage.getItem(LS_KEY_BASE_URL) || "";
	return v || "https://api.dify.ai/v1";
};

export const getDifyApiKey = (): string => {
	return localStorage.getItem(LS_KEY_API_KEY) || "";
};

export const setDifyBaseUrl = (url: string) => localStorage.setItem(LS_KEY_BASE_URL, url);
export const setDifyApiKey = (key: string) => localStorage.setItem(LS_KEY_API_KEY, key);

export async function testDifyConnection(
	baseUrl?: string,
	apiKey?: string,
): Promise<{ ok: boolean; info?: any; error?: string }> {
	const url = `${(baseUrl || getDifyBaseUrl()).replace(/\/$/, "")}/info`;
	const key = apiKey || getDifyApiKey();
	try {
		const res = await fetch(url, {
			method: "GET",
			headers: { Authorization: `Bearer ${key}` },
		});
		if (!res.ok) {
			const text = await res.text().catch(() => "");
			return { ok: false, error: `HTTP ${res.status} ${res.statusText} ${text}` };
		}
		const info = await res.json().catch(() => ({}));
		return { ok: true, info };
	} catch (e: any) {
		return { ok: false, error: e?.message || "连接异常" };
	}
}

/**
 * 以 SSE 方式发送消息并逐步回调事件
 */
export function chatWithDifyStreaming(
	opts: DifyChatOptions,
	onEvent: (evt: DifyEvent) => void,
	config?: { baseUrl?: string; apiKey?: string },
): DifyStreamHandle {
	const baseUrl = (config?.baseUrl || getDifyBaseUrl()).replace(/\/$/, "");
	const apiKey = config?.apiKey || getDifyApiKey();
	const controller = new AbortController();
	let lastTaskId: string | undefined;
	let _lastMessageId: string | undefined;

	const payload: any = {
		inputs: opts.inputs || {},
		query: opts.query || "",
		response_mode: "streaming",
		conversation_id: opts.conversationId || "",
		user: opts.user || "moros-local",
		files: opts.files || [], // 始终携带files字段，避免被省略为null
	};
	// 兼容性处理：同时把文件也放进inputs.files
	if (opts.files && opts.files.length > 0) {
		payload.inputs.files = opts.files;
	}
	if (typeof opts.autoGenerateName === "boolean") payload.auto_generate_name = opts.autoGenerateName;

	(async () => {
		try {
			const res = await fetch(`${baseUrl}/chat-messages`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
				signal: controller.signal,
			});
			if (!res.ok || !res.body) {
				onEvent({ event: "error", message: `HTTP ${res.status} ${res.statusText}` });
				return;
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder("utf-8");
			let buffer = "";
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				// SSE 按空行分割块
				let idx: number = buffer.indexOf("\n\n");
				while (idx !== -1) {
					const chunk = buffer.slice(0, idx);
					buffer = buffer.slice(idx + 2);
					const line = chunk.split("\n").find((l) => l.startsWith("data: ")) || "";
					const jsonStr = line.replace(/^data:\s*/, "");
					if (!jsonStr || jsonStr === "[DONE]") continue;
					try {
						const data = JSON.parse(jsonStr);
						// 记录 task_id / message_id 便于停止
						if (data.task_id) lastTaskId = data.task_id;
						if (data.message_id) _lastMessageId = data.message_id;
						const evt: DifyEvent = { event: data.event || "message", ...data };
						onEvent(evt);
					} catch {
						// 忽略解析失败的行
					}
					idx = buffer.indexOf("\n\n");
				}
			}
		} catch (e: any) {
			if (e?.name === "AbortError") return;
			onEvent({ event: "error", message: e?.message || "网络异常" });
		}
	})();

	async function stop() {
		try {
			if (!lastTaskId) return;
			const res = await fetch(`${baseUrl}/chat-messages/${encodeURIComponent(lastTaskId)}/stop`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ user: opts.user || "moros-local" }),
			});
			if (!res.ok) {
				// 非致命错误，交给 UI 提示
			}
		} catch (_) {}
	}

	const abort = () => controller.abort();
	return { stop, abort };
}

/**
 * 上传文件到Dify并获取upload_file_id
 */
export async function uploadFileToDify(
	file: File,
	config?: { baseUrl?: string; apiKey?: string },
): Promise<{ id: string; name: string; size: number; extension: string; mime_type: string }> {
	const baseUrl = (config?.baseUrl || getDifyBaseUrl()).replace(/\/$/, "");
	const apiKey = config?.apiKey || getDifyApiKey();

	const formData = new FormData();
	formData.append("file", file);
	formData.append("user", "moros-local");

	const res = await fetch(`${baseUrl}/files/upload`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
		},
		body: formData,
	});

	if (!res.ok) {
		throw new Error(`上传文件失败: HTTP ${res.status} ${res.statusText}`);
	}

	return await res.json();
}

/**
 * 从本地文件内容创建临时文件并上传到Dify
 */
export async function uploadLocalFileContentToDify(
	fileName: string,
	content: string,
	config?: { baseUrl?: string; apiKey?: string },
): Promise<{ id: string; name: string; size: number; extension: string; mime_type: string }> {
	// 创建Blob并转换为File
	const blob = new Blob([content], { type: "text/plain" });
	const file = new File([blob], fileName, { type: "text/plain" });

	return uploadFileToDify(file, config);
}

export async function chatWithDifyBlocking(
	opts: DifyChatOptions,
	config?: { baseUrl?: string; apiKey?: string },
): Promise<{ answer: string; conversation_id?: string; message_id?: string; task_id?: string; metadata?: any }> {
	const baseUrl = (config?.baseUrl || getDifyBaseUrl()).replace(/\/$/, "");
	const apiKey = config?.apiKey || getDifyApiKey();
	const payload: any = {
		inputs: opts.inputs || {},
		query: opts.query || "",
		response_mode: "blocking",
		conversation_id: opts.conversationId || "",
		user: opts.user || "moros-local",
		files: opts.files || [], // 始终携带files字段，避免被省略为null
	};
	// 兼容性处理：同时把文件也放进inputs.files
	if (opts.files && opts.files.length > 0) {
		payload.inputs.files = opts.files;
	}
	if (typeof opts.autoGenerateName === "boolean") payload.auto_generate_name = opts.autoGenerateName;

	const res = await fetch(`${baseUrl}/chat-messages`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(payload),
	});
	if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
	const data = await res.json();
	return {
		answer: data?.answer || "",
		conversation_id: data?.conversation_id,
		message_id: data?.message_id,
		task_id: data?.task_id,
		metadata: data?.metadata,
	};
}
