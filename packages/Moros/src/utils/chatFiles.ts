const OPENED_CHAT_PATHS_KEY = "moros-opened-chat-paths";

export const isMorosChatPath = (filePath?: string): boolean => {
	return Boolean(filePath && String(filePath).toLowerCase().endsWith(".moros"));
};

const normalizePaths = (value: unknown): string[] => {
	if (!Array.isArray(value)) return [];
	const set = new Set<string>();
	for (const item of value) {
		if (typeof item !== "string") continue;
		const trimmed = item.trim();
		if (trimmed) set.add(trimmed);
	}
	return Array.from(set);
};

export const getOpenedChatPaths = (): string[] => {
	try {
		const raw = localStorage.getItem(OPENED_CHAT_PATHS_KEY);
		if (!raw) return [];
		return normalizePaths(JSON.parse(raw));
	} catch {
		return [];
	}
};

const setOpenedChatPaths = (paths: string[]) => {
	try {
		localStorage.setItem(OPENED_CHAT_PATHS_KEY, JSON.stringify(normalizePaths(paths)));
	} catch {}
};

export const markChatFileOpened = (filePath?: string) => {
	if (!isMorosChatPath(filePath)) return;
	const current = getOpenedChatPaths();
	if (current.includes(filePath!)) return;
	setOpenedChatPaths([...current, filePath!]);
};

export const unmarkChatFileOpened = (filePath?: string) => {
	if (!filePath) return;
	const current = getOpenedChatPaths();
	if (!current.includes(filePath)) return;
	setOpenedChatPaths(current.filter((path) => path !== filePath));
};

export const isEmptyMorosChatContent = (rawContent: string): boolean => {
	const content = String(rawContent || "");
	if (!content.trim()) return true;

	try {
		const parsed = JSON.parse(content);
		if (!parsed || typeof parsed !== "object") return false;
		const messages = Array.isArray((parsed as any).messages) ? (parsed as any).messages : [];
		const conversationId = String((parsed as any).conversationId || "").trim();
		return messages.length === 0 && conversationId.length === 0;
	} catch {
		return false;
	}
};
