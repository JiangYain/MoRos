const API_BASE = "http://localhost:53211/api";

export type LocalCliImageInput = {
	type: "image";
	data: string;
	mimeType: string;
};

export type LocalCliOpenAICodexCredentials = {
	access: string;
	refresh: string;
	expires: number;
	accountId: string;
	updatedAt?: number;
};

export type LocalCliStreamEvent =
	| {
			event: "session_meta";
			runtimeSessionId: string;
			sessionId?: string;
			sessionFile?: string;
			currentProvider?: string;
			currentModel?: string;
			created?: boolean;
	  }
	| {
			event: "message";
			answer: string;
			raw?: any;
	  }
	| {
			event: "tool_event";
			phase: "start" | "update" | "end";
			toolCallId?: string;
			toolName?: string;
			args?: any;
			result?: any;
			isError?: boolean;
			raw?: any;
	  }
	| {
			event: "message_end";
			assistantText?: string;
			raw?: any;
	  }
	| {
			event: "retry";
			raw?: any;
	  }
	| {
			event: "error";
			message: string;
			raw?: any;
	  };

export interface LocalCliChatOptions {
	provider?: string;
	model: string;
	message: string;
	copilotToken?: string;
	openaiCodexCredentials?: LocalCliOpenAICodexCredentials;
	opencodeApiKey?: string;
	opencodeGoBaseUrl?: string;
	runtimeSessionId?: string;
	resumeSessionFile?: string;
	images?: LocalCliImageInput[];
	skillPaths?: string[];
	chatFilePath?: string;
}

export interface LocalCliStreamHandle {
	stop: () => Promise<void>;
	abort: () => void;
}

const extractAssistantTextFromMessage = (message: any): string => {
	if (!message || message.role !== "assistant" || !Array.isArray(message.content)) return "";
	return message.content
		.filter((block) => block?.type === "text" && typeof block?.text === "string")
		.map((block) => String(block.text))
		.join("");
};

const extractAssistantTextFromAgentEnd = (payload: any): string => {
	const messages = Array.isArray(payload?.messages) ? payload.messages : [];
	const assistant = [...messages].reverse().find((message) => message?.role === "assistant");
	return extractAssistantTextFromMessage(assistant);
};

const extractAssistantErrorFromAgentEnd = (payload: any): string => {
	const messages = Array.isArray(payload?.messages) ? payload.messages : [];
	const assistant = [...messages].reverse().find((message) => message?.role === "assistant");
	if (!assistant) return "";
	const assistantText = extractAssistantTextFromMessage(assistant).trim();
	const errorMessage = String(assistant?.errorMessage || "").trim();
	const normalizedErrorMessage = errorMessage.toLowerCase();
	const isGenericProviderError =
		normalizedErrorMessage === "an unknown error occurred" ||
		normalizedErrorMessage === "model request failed with stopreason=error";
	if (errorMessage) {
		if (assistantText && isGenericProviderError) return "";
		return errorMessage;
	}
	if (String(assistant?.stopReason || "").toLowerCase() === "error") {
		if (assistantText) return "";
		return "Model request failed with stopReason=error";
	}
	return "";
};

const parseSseBlock = (rawBlock: string): { eventName: string; payload: any } | null => {
	const lines = rawBlock.split("\n");
	let eventName = "message";
	const dataLines: string[] = [];

	for (const rawLine of lines) {
		const line = rawLine.replace(/\r$/, "");
		if (!line || line.startsWith(":")) continue;
		if (line.startsWith("event:")) {
			eventName = line.slice(6).trim() || "message";
			continue;
		}
		if (line.startsWith("data:")) {
			dataLines.push(line.slice(5).trim());
		}
	}

	if (dataLines.length === 0) return null;
	const dataText = dataLines.join("\n");
	let payload: any = dataText;
	try {
		payload = JSON.parse(dataText);
	} catch {
		// keep raw text payload
	}
	return { eventName, payload };
};

const postSessionAction = async (path: string, runtimeSessionId: string): Promise<void> => {
	const sessionId = String(runtimeSessionId || "").trim();
	if (!sessionId) {
		throw new Error("runtimeSessionId is required");
	}

	const res = await fetch(`${API_BASE}${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ runtimeSessionId: sessionId }),
	});

	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`${res.status} ${res.statusText} ${text}`.trim());
	}
};

export const abortLocalCliSession = async (runtimeSessionId: string): Promise<void> => {
	await postSessionAction("/agent/session/abort", runtimeSessionId);
};

export const closeLocalCliSession = async (runtimeSessionId: string): Promise<void> => {
	await postSessionAction("/agent/session/close", runtimeSessionId);
};

export const chatWithLocalCliStreaming = (
	options: LocalCliChatOptions,
	onEvent: (event: LocalCliStreamEvent) => void,
): LocalCliStreamHandle => {
	const controller = new AbortController();

	(async () => {
		let messageEnded = false;
		let pendingAgentError: { message: string; raw?: any } | null = null;
		let pendingAgentErrorTimer: ReturnType<typeof setTimeout> | null = null;

		const clearPendingAgentError = () => {
			pendingAgentError = null;
			if (pendingAgentErrorTimer) {
				clearTimeout(pendingAgentErrorTimer);
				pendingAgentErrorTimer = null;
			}
		};

		const emitMessageEndOnce = (assistantText?: string, raw?: any) => {
			if (messageEnded) return;
			messageEnded = true;
			clearPendingAgentError();
			onEvent({
				event: "message_end",
				assistantText,
				raw,
			});
		};

		try {
			const res = await fetch(`${API_BASE}/agent/chat/stream`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(options),
				signal: controller.signal,
			});

			if (!res.ok || !res.body) {
				const text = await res.text().catch(() => "");
				onEvent({
					event: "error",
					message: `${res.status} ${res.statusText} ${text}`.trim(),
				});
				return;
			}

			const contentType = String(res.headers.get("content-type") || "").toLowerCase();
			if (!contentType.includes("text/event-stream")) {
				const text = await res.text().catch(() => "");
				onEvent({
					event: "error",
					message:
						`Unexpected stream response content-type: ${contentType || "unknown"}. ${text.slice(0, 280)}`.trim(),
				});
				return;
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder("utf-8");
			let buffer = "";
			let receivedSseEvent = false;

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				buffer = buffer.replace(/\r\n/g, "\n");

				let splitIndex = buffer.indexOf("\n\n");
				while (splitIndex !== -1) {
					const block = buffer.slice(0, splitIndex);
					buffer = buffer.slice(splitIndex + 2);
					splitIndex = buffer.indexOf("\n\n");

					const parsed = parseSseBlock(block);
					if (!parsed) continue;
					const { eventName, payload } = parsed;
					receivedSseEvent = true;

					if (eventName === "session_meta") {
						onEvent({
							event: "session_meta",
							runtimeSessionId: String(payload?.runtimeSessionId || ""),
							sessionId: payload?.sessionId ? String(payload.sessionId) : undefined,
							sessionFile: payload?.sessionFile ? String(payload.sessionFile) : undefined,
							currentProvider: payload?.currentProvider ? String(payload.currentProvider) : undefined,
							currentModel: payload?.currentModel ? String(payload.currentModel) : undefined,
							created: Boolean(payload?.created),
						});
						continue;
					}

					if (eventName === "agent_event") {
						const type = String(payload?.type || "");

						if (type === "auto_retry_start") {
							messageEnded = false;
							clearPendingAgentError();
							onEvent({ event: "retry", raw: payload });
							continue;
						}

						if (type === "message_update") {
							const deltaType = payload?.assistantMessageEvent?.type;
							const deltaText = payload?.assistantMessageEvent?.delta;
							if (deltaType === "text_delta" && typeof deltaText === "string" && deltaText) {
								onEvent({
									event: "message",
									answer: deltaText,
									raw: payload,
								});
							}
						}

						if (type === "tool_execution_start") {
							onEvent({
								event: "tool_event",
								phase: "start",
								toolCallId: payload?.toolCallId,
								toolName: payload?.toolName,
								args: payload?.args,
								raw: payload,
							});
						} else if (type === "tool_execution_update") {
							onEvent({
								event: "tool_event",
								phase: "update",
								toolCallId: payload?.toolCallId,
								toolName: payload?.toolName,
								args: payload?.args,
								result: payload?.partialResult,
								raw: payload,
							});
						} else if (type === "tool_execution_end") {
							onEvent({
								event: "tool_event",
								phase: "end",
								toolCallId: payload?.toolCallId,
								toolName: payload?.toolName,
								result: payload?.result,
								isError: Boolean(payload?.isError),
								raw: payload,
							});
						}

						if (type === "agent_end") {
							const assistantError = extractAssistantErrorFromAgentEnd(payload);
							if (assistantError) {
								pendingAgentError = { message: assistantError, raw: payload };
								pendingAgentErrorTimer = setTimeout(() => {
									if (messageEnded || !pendingAgentError) return;
									messageEnded = true;
									onEvent({
										event: "error",
										message: pendingAgentError.message,
										raw: pendingAgentError.raw,
									});
									pendingAgentError = null;
									pendingAgentErrorTimer = null;
								}, 1500);
								continue;
							}
							emitMessageEndOnce(extractAssistantTextFromAgentEnd(payload), payload);
						}
						continue;
					}

					if (eventName === "assistant_final") {
						emitMessageEndOnce(String(payload?.text || ""), payload);
						continue;
					}

					if (eventName === "done") {
						emitMessageEndOnce(undefined, payload);
						continue;
					}

					if (eventName === "error") {
						messageEnded = true;
						clearPendingAgentError();
						onEvent({
							event: "error",
							message: String(payload?.message || "Local CLI stream failed"),
							raw: payload,
						});
					}
				}
			}

			if (pendingAgentError && !messageEnded) {
				messageEnded = true;
				onEvent({
					event: "error",
					message: pendingAgentError.message,
					raw: pendingAgentError.raw,
				});
			}
			clearPendingAgentError();

			if (!receivedSseEvent) {
				messageEnded = true;
				onEvent({
					event: "error",
					message: "No SSE events received from local CLI backend",
				});
				return;
			}

			emitMessageEndOnce();
		} catch (error: any) {
			clearPendingAgentError();
			if (error?.name === "AbortError") return;
			onEvent({
				event: "error",
				message: error?.message || "Local CLI stream failed",
			});
		}
	})();

	return {
		stop: async () => {
			controller.abort();
		},
		abort: () => controller.abort(),
	};
};
