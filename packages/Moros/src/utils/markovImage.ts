/*
  MoRos Image API utils (front-end)
  - Stores BaseURL/API Key in localStorage
  - Provides a simple blocking image generation call
*/

export type MorosImageResponse = {
	// Data URL if we could resolve to one
	dataURL?: string;
	// Remote URL if provider returns a link instead of base64
	url?: string;
	// Raw provider payload for debugging
	raw?: any;
};

const LS_KEY_BASE_URL = "markov-image-base-url";
const LS_KEY_API_KEY = "markov-image-api-key";

const MIDJOURNEY_DEFAULT_BOT_TYPE = "MID_JOURNEY";
const MIDJOURNEY_POLL_INTERVAL_MS = 2000;
const MIDJOURNEY_POLL_TIMEOUT_MS = 180000;

export const getMorosBaseUrl = (): string => {
	const v = localStorage.getItem(LS_KEY_BASE_URL) || "";
	// fallback to example but empty by default
	return v || "https://api.tu-zi.com/v1";
};

export const getMorosApiKey = (): string => {
	return localStorage.getItem(LS_KEY_API_KEY) || "";
};

export const setMorosBaseUrl = (url: string) => localStorage.setItem(LS_KEY_BASE_URL, url);
export const setMorosApiKey = (key: string) => localStorage.setItem(LS_KEY_API_KEY, key);

export async function testMorosConnection(baseUrl?: string, apiKey?: string): Promise<{ ok: boolean; error?: string }> {
	try {
		const url = `${(baseUrl || getMorosBaseUrl()).replace(/\/$/, "")}/chat/completions`;
		const key = apiKey || getMorosApiKey();
		const res = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${key}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				stream: false,
				model: "gemini-2.5-flash-image-vip",
				messages: [{ role: "user", content: "ping" }],
				temperature: 0.7,
				top_p: 1,
				max_tokens: 4096,
				frequency_penalty: 0,
				presence_penalty: 0,
			}),
		});
		if (!res.ok) return { ok: false, error: `HTTP ${res.status} ${res.statusText}` };
		return { ok: true };
	} catch (e: any) {
		return { ok: false, error: e?.message || "Network error" };
	}
}

// Helper: convert a Blob to DataURL
async function blobToDataURL(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result || ""));
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});
}

// Try to extract an image URL or base64 from various provider shapes
function extractImageFromPayload(payload: any): { url?: string; b64?: string; mime?: string } | null {
	if (!payload) return null;

	// Common OpenAI-like shape: choices[0].message.content[] with type image_url
	try {
		const choices = payload.choices;
		if (Array.isArray(choices) && choices.length) {
			const msg = choices[0]?.message;
			const content = msg?.content;
			if (Array.isArray(content)) {
				for (const part of content) {
					if (part?.type === "image_url" && part?.image_url?.url) {
						return { url: part.image_url.url };
					}
					if (part?.type === "image" && part?.b64_json) {
						return { b64: part.b64_json, mime: "image/png" };
					}
					if (typeof part === "string") {
						const str = part.trim();
						// Extract markdown image URL: ![alt](url)
						const markdownMatch = str.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
						if (markdownMatch) return { url: markdownMatch[1] };

						if (/^data:image\//.test(str))
							return {
								b64: str.replace(/^data:image\/[^;]+;base64,/, ""),
								mime: str.match(/^data:(image\/[^;]+)/)?.[1] || "image/png",
							};
						if (/^https?:\/\//i.test(str)) return { url: str };
					}
				}
			} else if (typeof content === "string") {
				const str = content.trim();
				// Extract markdown image URL: ![alt](url)
				const markdownMatch = str.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
				if (markdownMatch) return { url: markdownMatch[1] };

				if (/^data:image\//.test(str))
					return {
						b64: str.replace(/^data:image\/[^;]+;base64,/, ""),
						mime: str.match(/^data:(image\/[^;]+)/)?.[1] || "image/png",
					};
				if (/^https?:\/\//i.test(str)) return { url: str };
			}
		}
	} catch {}

	// Some providers return { data: [{ b64_json }] }
	try {
		const dataArr = payload.data;
		if (Array.isArray(dataArr) && dataArr.length && dataArr[0]?.b64_json) {
			return { b64: dataArr[0].b64_json, mime: "image/png" };
		}
	} catch {}

	// Some providers: { images: [ { url | base64 } ] }
	try {
		const imgs = payload.images;
		if (Array.isArray(imgs) && imgs.length) {
			const img0 = imgs[0];
			if (typeof img0 === "string") {
				if (/^data:image\//.test(img0))
					return {
						b64: img0.replace(/^data:image\/[^;]+;base64,/, ""),
						mime: img0.match(/^data:(image\/[^;]+)/)?.[1] || "image/png",
					};
				if (/^https?:\/\//i.test(img0)) return { url: img0 };
			} else if (img0?.url) {
				return { url: img0.url };
			} else if (img0?.base64 || img0?.b64) {
				return { b64: img0.base64 || img0.b64, mime: "image/png" };
			}
		}
	} catch {}

	// Fallback: if payload looks like a direct URL string
	if (typeof payload === "string") {
		const s = payload.trim();
		if (/^data:image\//.test(s))
			return {
				b64: s.replace(/^data:image\/[^;]+;base64,/, ""),
				mime: s.match(/^data:(image\/[^;]+)/)?.[1] || "image/png",
			};
		if (/^https?:\/\//i.test(s)) return { url: s };
	}

	return null;
}

// 辅助函数：将dataURL转换为Blob
async function dataURLToBlob(dataURL: string): Promise<Blob> {
	const response = await fetch(dataURL);
	return response.blob();
}

// 辅助函数：合并多张图像为一张
async function mergeImages(imageDataURLs: string[]): Promise<string> {
	if (imageDataURLs.length === 0) return "";
	if (imageDataURLs.length === 1) return imageDataURLs[0];

	// 加载所有图像
	const images = await Promise.all(
		imageDataURLs.map((dataURL) => {
			return new Promise<HTMLImageElement>((resolve, reject) => {
				const img = new Image();
				img.onload = () => resolve(img);
				img.onerror = reject;
				img.src = dataURL;
			});
		}),
	);

	// 计算合并后的画布尺寸
	const totalWidth = images.reduce((sum, img) => sum + img.width, 0);
	const maxHeight = Math.max(...images.map((img) => img.height));

	// 创建画布
	const canvas = document.createElement("canvas");
	canvas.width = totalWidth;
	canvas.height = maxHeight;
	const ctx = canvas.getContext("2d");

	if (!ctx) throw new Error("无法获取Canvas上下文");

	// 水平拼接图像
	let currentX = 0;
	for (const img of images) {
		ctx.drawImage(img, currentX, 0, img.width, img.height);
		currentX += img.width;
	}

	// 返回合并后的dataURL
	return canvas.toDataURL("image/png", 0.92);
}

const MIDJOURNEY_SUCCESS_STATES = new Set(["SUCCESS", "FINISH", "FINISHED", "COMPLETED", "COMPLETE", "DONE"]);
const MIDJOURNEY_FAILURE_STATES = new Set(["FAIL", "FAILED", "FAILURE", "ERROR", "CANCELLED", "CANCELED", "STOPPED"]);

type MidjourneyStatusUpdate = {
	status: string;
	progress?: string;
	description?: string;
};

type MidjourneyGenerateConfig = {
	baseUrl?: string;
	apiKey?: string;
	botType?: string;
	images?: string[];
	accountFilter?: any;
	state?: string;
	notifyHook?: string;
	pollIntervalMs?: number;
	pollTimeoutMs?: number;
	onStatus?: (update: MidjourneyStatusUpdate) => void;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function normalizeMidjourneyBaseUrl(baseUrl?: string): string {
	const fallback = "https://api.tu-zi.com";
	const raw = (baseUrl || "").trim();
	if (!raw) return fallback;
	try {
		const parsed = new URL(raw);
		const trimmedPath = parsed.pathname.replace(/\/+$/, "");
		if (/^\/v\d+$/i.test(trimmedPath) || /^\/(pg|api)$/i.test(trimmedPath)) {
			parsed.pathname = "/";
		}
		const finalPath = parsed.pathname.replace(/\/+$/, "");
		return finalPath && finalPath !== "/" ? parsed.origin + finalPath : parsed.origin;
	} catch {
		const cleaned = raw
			.replace(/\/v\d+$/i, "")
			.replace(/\/(pg|api)$/i, "")
			.replace(/\/+$/, "");
		return cleaned || fallback;
	}
}

function stripDataUrlPrefix(dataURL: string): string | null {
	if (!dataURL) return null;
	const match = dataURL.match(/^data:image\/[^;]+;base64,(.+)$/);
	if (match) return match[1];
	const commaIndex = dataURL.indexOf(",");
	if (commaIndex >= 0) return dataURL.slice(commaIndex + 1);
	return null;
}

function collectMidjourneyTasks(payload: any): any[] {
	if (!payload) return [];
	if (Array.isArray(payload)) return payload;
	const collections = [
		payload.result,
		payload.data,
		payload.tasks,
		payload.list,
		payload.properties?.tasks,
		payload.properties?.list,
	];
	for (const item of collections) {
		if (!item) continue;
		if (Array.isArray(item)) return item;
		if (Array.isArray(item?.list)) return item.list;
		if (Array.isArray(item?.tasks)) return item.tasks;
		if (typeof item === "object") return [item];
	}
	if (typeof payload === "object" && (payload.taskId || payload.id)) {
		return [payload];
	}
	return [];
}

function isMidjourneySuccessStatus(status: string): boolean {
	if (!status) return false;
	return MIDJOURNEY_SUCCESS_STATES.has(status);
}

function isMidjourneyFailureStatus(status: string): boolean {
	if (!status) return false;
	return MIDJOURNEY_FAILURE_STATES.has(status);
}

function normalizeMidjourneyTask(task: any) {
	const statusRaw = String(task?.status || task?.state || task?.taskStatus || "").toUpperCase();
	let progress: string | undefined;
	const progressCandidate =
		task?.progress ??
		task?.progressValue ??
		task?.progressPercent ??
		task?.progressPercentage ??
		task?.percent ??
		task?.percentage;

	if (typeof progressCandidate === "string" && progressCandidate.trim()) {
		progress = progressCandidate.trim();
	} else if (typeof progressCandidate === "number" && Number.isFinite(progressCandidate)) {
		progress = `${Math.round(progressCandidate)}%`;
	}

	const description = task?.failReason || task?.description || task?.statusMessage || task?.message;
	const urls: string[] = [];
	const pushUrl = (value: any) => {
		if (typeof value === "string" && /^https?:\/\//i.test(value) && !urls.includes(value)) {
			urls.push(value);
		}
	};

	pushUrl(task?.imageUrl);
	if (Array.isArray(task?.imageUrls)) task.imageUrls.forEach(pushUrl);
	if (Array.isArray(task?.imageUrlList)) task.imageUrlList.forEach(pushUrl);
	if (Array.isArray(task?.images))
		task.images.forEach((item: any) => {
			pushUrl(typeof item === "string" ? item : item?.url || item?.uri || item?.imageUrl);
		});
	if (Array.isArray(task?.imageList))
		task.imageList.forEach((item: any) => {
			pushUrl(typeof item === "string" ? item : item?.url || item?.uri || item?.imageUrl);
		});

	if (task?.properties) {
		pushUrl(task.properties.imageUrl);
		if (Array.isArray(task.properties.imageUrls)) task.properties.imageUrls.forEach(pushUrl);
	}

	if (task?.result) {
		pushUrl(task.result.imageUrl);
		if (Array.isArray(task.result.imageUrls)) task.result.imageUrls.forEach(pushUrl);
		if (Array.isArray(task.result.images))
			task.result.images.forEach((item: any) => {
				pushUrl(typeof item === "string" ? item : item?.url || item?.uri || item?.imageUrl);
			});
	}

	const finishedByFlag = task?.finish === true || task?.finished === true;
	const done = isMidjourneySuccessStatus(statusRaw) || finishedByFlag || progress === "100%";
	const failed = isMidjourneyFailureStatus(statusRaw);

	return {
		status: statusRaw || (done ? "SUCCESS" : ""),
		progress,
		description,
		imageUrls: urls,
		done,
		failed,
	};
}

export async function generateImageFromPromptMidjourney(
	prompt: string,
	config?: MidjourneyGenerateConfig,
): Promise<MorosImageResponse> {
	const apiKey = config?.apiKey || getMorosApiKey();
	const midjourneyBase = normalizeMidjourneyBaseUrl(config?.baseUrl || getMorosBaseUrl());
	const pollInterval = Math.max(500, config?.pollIntervalMs ?? MIDJOURNEY_POLL_INTERVAL_MS);
	const pollTimeout = Math.max(pollInterval * 2, config?.pollTimeoutMs ?? MIDJOURNEY_POLL_TIMEOUT_MS);
	const botType = config?.botType || MIDJOURNEY_DEFAULT_BOT_TYPE;

	const normalizedBase = midjourneyBase.replace(/\/+$/, "");

	const base64Array: string[] = [];
	if (config?.images?.length) {
		for (const dataURL of config.images) {
			const stripped = stripDataUrlPrefix(dataURL);
			if (stripped) {
				base64Array.push(stripped);
				continue;
			}
			try {
				const blob = await dataURLToBlob(dataURL);
				const buffer = await blob.arrayBuffer();
				const bytes = new Uint8Array(buffer);
				let binary = "";
				for (let i = 0; i < bytes.length; i++) {
					binary += String.fromCharCode(bytes[i]);
				}
				if (binary) {
					base64Array.push(btoa(binary));
				}
			} catch {
				// ignore conversion errors
			}
		}
	}

	const payload: any = {
		prompt: prompt || "",
		botType,
		base64Array,
	};

	if (config?.accountFilter) payload.accountFilter = config.accountFilter;
	if (typeof config?.notifyHook === "string") payload.notifyHook = config.notifyHook;
	if (typeof config?.state === "string" && config.state) payload.state = config.state;

	const submitRes = await fetch(`${normalizedBase}/mj/submit/imagine`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(payload),
	});

	if (!submitRes.ok) {
		const text = await submitRes.text().catch(() => "");
		throw new Error(`HTTP ${submitRes.status} ${submitRes.statusText}${text ? ` ${text}` : ""}`);
	}

	let submitData: any;
	try {
		submitData = await submitRes.json();
	} catch {
		throw new Error("Failed to parse Midjourney submission response");
	}

	const submitCode = typeof submitData?.code === "number" ? submitData.code : null;
	if (submitCode !== null && submitCode !== 1 && submitCode !== 22) {
		throw new Error(submitData?.description || "Midjourney submission failed");
	}

	let taskId: string | null = null;
	const resultCandidate = submitData?.result ?? submitData?.data ?? submitData;
	if (typeof resultCandidate === "string" || typeof resultCandidate === "number") {
		taskId = String(resultCandidate);
	} else if (resultCandidate && typeof resultCandidate === "object") {
		taskId = resultCandidate.taskId || resultCandidate.id || resultCandidate.result || resultCandidate.jobId || null;
	}

	if (!taskId) {
		throw new Error("Midjourney did not return a task id");
	}

	let lastStatusKey = "";
	const emitStatus = (update: MidjourneyStatusUpdate) => {
		const key = `${update.status || ""}|${update.progress || ""}|${update.description || ""}`;
		if (key === lastStatusKey) return;
		lastStatusKey = key;
		if (config?.onStatus) {
			config.onStatus(update);
		}
	};

	emitStatus({
		status: submitCode === 22 ? "QUEUE" : "SUBMITTED",
		description: submitData?.description,
	});

	const deadline = Date.now() + pollTimeout;
	let resolvedVariant: any = null;
	let attemptedFallbackGet = false;
	let lastFetchError: string | undefined;
	let lastKnownTask: any = null;

	while (Date.now() < deadline) {
		let responsePayload: any = null;

		const variants = resolvedVariant
			? [resolvedVariant]
			: [
					{ body: { ids: [taskId] }, method: "POST" },
					{ body: { taskIds: [taskId] }, method: "POST" },
					{ body: { taskId: taskId }, method: "POST" },
					{ body: { list: [taskId] }, method: "POST" },
					{ body: [taskId], method: "POST" },
				];

		for (const variant of variants) {
			try {
				const res = await fetch(`${normalizedBase}/mj/task/list-by-ids`, {
					method: variant.method,
					headers: {
						Authorization: `Bearer ${apiKey}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify(variant.body),
				});

				if (!res.ok) {
					lastFetchError = `HTTP ${res.status} ${res.statusText}`;
					continue;
				}

				responsePayload = await res.json();
				resolvedVariant = variant;
				break;
			} catch (error: any) {
				lastFetchError = error?.message || "Network error";
			}
		}

		if (!responsePayload && !attemptedFallbackGet) {
			attemptedFallbackGet = true;
			try {
				const res = await fetch(`${normalizedBase}/mj/task/${encodeURIComponent(taskId)}`, {
					method: "GET",
					headers: {
						Authorization: `Bearer ${apiKey}`,
					},
				});
				if (res.ok) {
					responsePayload = await res.json();
				} else {
					lastFetchError = `HTTP ${res.status} ${res.statusText}`;
				}
			} catch (error: any) {
				lastFetchError = error?.message || "Network error";
			}
		}

		if (responsePayload) {
			const tasks = collectMidjourneyTasks(responsePayload);
			const task =
				tasks.find((item) => {
					const candidates = [
						item?.taskId,
						item?.id,
						item?.task_id,
						item?.result?.taskId,
						item?.properties?.taskId,
					];
					return candidates.some((value) => value && String(value) === taskId);
				}) || (tasks.length === 1 ? tasks[0] : null);

			if (task) {
				lastKnownTask = task;
				const normalized = normalizeMidjourneyTask(task);

				emitStatus({
					status: normalized.status || (normalized.done ? "SUCCESS" : ""),
					progress: normalized.progress,
					description: normalized.description,
				});

				if (normalized.failed) {
					throw new Error(normalized.description || "Midjourney generation failed");
				}

				if (normalized.done && normalized.imageUrls.length) {
					const imageUrl = normalized.imageUrls[0];
					try {
						const imgRes = await fetch(imageUrl);
						if (!imgRes.ok) {
							return { url: imageUrl, raw: { submit: submitData, task: task } };
						}
						const blob = await imgRes.blob();
						const dataURL = await blobToDataURL(blob);
						return { dataURL, url: imageUrl, raw: { submit: submitData, task: task } };
					} catch {
						return { url: normalized.imageUrls[0], raw: { submit: submitData, task: task } };
					}
				}
			}

			if (responsePayload?.code && responsePayload.code !== 1 && responsePayload.code !== 22 && !tasks.length) {
				lastFetchError = responsePayload?.description || "Midjourney task query failed";
			}
		}

		await sleep(pollInterval);
	}

	if (lastKnownTask) {
		const normalized = normalizeMidjourneyTask(lastKnownTask);
		if (normalized.imageUrls.length) {
			const imageUrl = normalized.imageUrls[0];
			try {
				const imgRes = await fetch(imageUrl);
				if (imgRes.ok) {
					const blob = await imgRes.blob();
					const dataURL = await blobToDataURL(blob);
					return { dataURL, url: imageUrl, raw: { submit: submitData, task: lastKnownTask } };
				}
			} catch {
				// ignore
			}
			return { url: imageUrl, raw: { submit: submitData, task: lastKnownTask } };
		}
	}

	throw new Error(lastFetchError ? `Midjourney task timeout (${lastFetchError})` : "Midjourney task timeout");
}

// GPT-4O图像生成函数
export async function generateImageFromPromptGPT4O(
	prompt: string,
	config?: { apiKey?: string; images?: string[] },
): Promise<MorosImageResponse> {
	const apiKey = config?.apiKey || getMorosApiKey();
	const images = config?.images || [];

	// 如果没有提供图像，使用原来的生成API
	if (images.length === 0) {
		const payload = {
			model: "gpt-4o-image",
			prompt: prompt || "",
			n: 1,
			size: "1024x1024",
			response_format: "b64_json", // 指定返回base64格式避免跨域问题
		};

		const res = await fetch("https://api.tu-zi.com/v1/images/generations", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		});

		if (!res.ok) {
			const text = await res.text().catch(() => "");
			throw new Error(`HTTP ${res.status} ${res.statusText} ${text}`);
		}

		const data = await res.json();

		// GPT-4O API返回格式处理
		if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
			const imageItem = data.data[0];
			if (imageItem.url) {
				try {
					const imgRes = await fetch(imageItem.url);
					const blob = await imgRes.blob();
					const dataURL = await blobToDataURL(blob);
					return { dataURL, url: imageItem.url, raw: data };
				} catch {
					// 如果CORS阻止，至少返回URL
					return { url: imageItem.url, raw: data };
				}
			}
			if (imageItem.b64_json) {
				return { dataURL: `data:image/png;base64,${imageItem.b64_json}`, raw: data };
			}
		}

		throw new Error("GPT-4O API response did not contain an image");
	}

	// 如果提供了图像，使用编辑API
	if (images.length > 0) {
		const formData = new FormData();

		// 如果有多张图像，先合并它们
		let imageToEdit: string;
		if (images.length > 1) {
			imageToEdit = await mergeImages(images);
		} else {
			imageToEdit = images[0];
		}

		// 将图像作为要编辑的图像
		const imageBlob = await dataURLToBlob(imageToEdit);
		formData.append("image", imageBlob, "image.png");

		formData.append("prompt", prompt || "");
		formData.append("n", "1");
		formData.append("size", "1024x1024");
		formData.append("response_format", "b64_json");
		formData.append("model", "gpt-4o-image-vip");

		const res = await fetch("https://api.tu-zi.com/v1/images/edits", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				// 不要设置Content-Type，让浏览器自动设置boundary
			},
			body: formData,
		});

		if (!res.ok) {
			const text = await res.text().catch(() => "");
			throw new Error(`HTTP ${res.status} ${res.statusText} ${text}`);
		}

		const data = await res.json();

		// 处理编辑API的返回格式
		if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
			const imageItem = data.data[0];
			if (imageItem.b64_json) {
				return { dataURL: `data:image/png;base64,${imageItem.b64_json}`, raw: data };
			}
			if (imageItem.url) {
				try {
					const imgRes = await fetch(imageItem.url);
					const blob = await imgRes.blob();
					const dataURL = await blobToDataURL(blob);
					return { dataURL, url: imageItem.url, raw: data };
				} catch {
					// 如果CORS阻止，至少返回URL
					return { url: imageItem.url, raw: data };
				}
			}
		}

		throw new Error("GPT-4O Edit API response did not contain an image");
	}

	// 不应该到达这里，但为了类型安全
	throw new Error("Unexpected code path in generateImageFromPromptGPT4O");
}

export async function generateImageFromPrompt(
	prompt: string,
	config?: { baseUrl?: string; apiKey?: string; model?: string; stream?: boolean; images?: string[] },
): Promise<MorosImageResponse> {
	const baseUrl = (config?.baseUrl || getMorosBaseUrl()).replace(/\/$/, "");
	const apiKey = config?.apiKey || getMorosApiKey();
	const model = config?.model || "gemini-2.5-flash-image";
	const stream = config?.stream ?? true; // Default to stream mode like the working example
	const images = config?.images || [];

	// 构建消息内容 - 支持图文混合
	let messageContent: any = prompt || "";

	if (images.length > 0) {
		// 使用Gemini的图文混合格式
		const contentParts: any[] = [{ type: "text", text: prompt || "" }];

		for (const imageDataURL of images) {
			contentParts.push({
				type: "image_url",
				image_url: { url: imageDataURL },
			});
		}

		messageContent = contentParts;
	}

	const payload = {
		stream,
		model,
		messages: [{ role: "user", content: messageContent }],
		temperature: 0.7,
		top_p: 1,
		max_tokens: 4096,
		frequency_penalty: 0,
		presence_penalty: 0,
	};

	const res = await fetch(`${baseUrl}/chat/completions`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(payload),
	});

	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`HTTP ${res.status} ${res.statusText} ${text}`);
	}

	let data: any;
	let fullContent = "";

	if (stream) {
		// Handle streaming response
		const reader = res.body?.getReader();
		if (!reader) throw new Error("Stream reader not available");

		const decoder = new TextDecoder();
		let buffer = "";

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() || ""; // Keep incomplete line in buffer

			for (const line of lines) {
				const cleanLine = line.trim();
				if (!cleanLine || cleanLine === "data: [DONE]") continue;

				if (cleanLine.startsWith("data: ")) {
					try {
						const chunk = JSON.parse(cleanLine.slice(6));
						const content = chunk.choices?.[0]?.delta?.content;
						if (content) {
							fullContent += content;
						}
						data = chunk; // Keep the last chunk for metadata
					} catch {
						// Ignore malformed chunks
					}
				}
			}
		}

		// Create a synthetic response object for extractImageFromPayload
		data = {
			choices: [
				{
					message: {
						content: fullContent,
					},
				},
			],
		};
	} else {
		// Handle non-streaming response
		const text = await res.text();
		try {
			data = JSON.parse(text);
		} catch {
			data = text;
		}
	}

	const picked = extractImageFromPayload(data);
	if (!picked) {
		// if provider returned raw base64 string
		if (typeof data === "string" && /^([A-Za-z0-9+/=\r\n]+)$/.test(data.trim())) {
			return { dataURL: `data:image/png;base64,${data.trim()}`, raw: data };
		}
		throw new Error("Provider response did not contain an image");
	}

	if (picked.b64) {
		const mime = picked.mime || "image/png";
		return { dataURL: `data:${mime};base64,${picked.b64}`, raw: data };
	}

	if (picked.url) {
		try {
			const imgRes = await fetch(picked.url);
			const blob = await imgRes.blob();
			const dataURL = await blobToDataURL(blob);
			return { dataURL, url: picked.url, raw: data };
		} catch {
			// If CORS blocks, return the URL at least
			return { url: picked.url, raw: data };
		}
	}

	throw new Error("Unknown image payload format");
}

// GPT-4O图像变体生成函数
export async function generateImageVariationGPT4O(
	imageDataURL: string,
	config?: { apiKey?: string; n?: number; size?: string },
): Promise<MorosImageResponse> {
	const apiKey = config?.apiKey || getMorosApiKey();
	const n = config?.n || 1;
	const size = config?.size || "1024x1024";

	const formData = new FormData();

	// 将图像转换为Blob并添加到FormData
	const imageBlob = await dataURLToBlob(imageDataURL);
	formData.append("image", imageBlob, "image.png");

	formData.append("n", n.toString());
	formData.append("size", size);
	formData.append("response_format", "b64_json"); // 使用base64避免跨域问题

	const res = await fetch("https://api.tu-zi.com/v1/images/variations", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			// 不要设置Content-Type，让浏览器自动设置boundary
		},
		body: formData,
	});

	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`HTTP ${res.status} ${res.statusText} ${text}`);
	}

	const data = await res.json();

	// 处理变体API的返回格式
	if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
		const imageItem = data.data[0];
		if (imageItem.b64_json) {
			return { dataURL: `data:image/png;base64,${imageItem.b64_json}`, raw: data };
		}
		if (imageItem.url) {
			try {
				const imgRes = await fetch(imageItem.url);
				const blob = await imgRes.blob();
				const dataURL = await blobToDataURL(blob);
				return { dataURL, url: imageItem.url, raw: data };
			} catch {
				// 如果CORS阻止，至少返回URL
				return { url: imageItem.url, raw: data };
			}
		}
	}

	throw new Error("GPT-4O Variations API response did not contain an image");
}
