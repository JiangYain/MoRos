export const API_BASE = "http://localhost:53211/api";

interface ApiResponse<T = any> {
	success: boolean;
	data?: T;
	error?: string;
	message?: string;
}

export const filesApi = {
	async getFileTree(): Promise<any[]> {
		const response = await fetch(`${API_BASE}/files`);
		const result = (await response.json()) as ApiResponse;
		if (!result.success) throw new Error(result.error);
		return result.data || [];
	},

	async createFolder(name: string, parentPath?: string): Promise<any> {
		const response = await fetch(`${API_BASE}/files/folder`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name, parentPath }),
		});
		const result = (await response.json()) as ApiResponse;
		if (!result.success) throw new Error(result.error);
		return result.data;
	},

	async createFile(name: string, content: string = "", parentPath?: string): Promise<any> {
		const response = await fetch(`${API_BASE}/files/file`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name, content, parentPath }),
		});
		const result = (await response.json()) as ApiResponse;
		if (!result.success) throw new Error(result.error);
		return result.data;
	},

	async readFile(filePath: string): Promise<string> {
		const response = await fetch(`${API_BASE}/files/content/${encodeURIComponent(filePath)}`);
		const result = (await response.json()) as ApiResponse;
		if (!result.success) throw new Error(result.error);
		return result.data?.content || "";
	},

	async saveFile(
		filePath: string,
		content: string,
		options?: { keepalive?: boolean; signal?: AbortSignal },
	): Promise<void> {
		const response = await fetch(`${API_BASE}/files/content/${encodeURIComponent(filePath)}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ content }),
			keepalive: options?.keepalive ?? false,
			signal: options?.signal,
		});
		const ct = response.headers.get("content-type") || "";
		if (ct.includes("application/json")) {
			const result = (await response.json()) as ApiResponse;
			if (!response.ok || !result.success) {
				throw new Error(result.error || `HTTP ${response.status}`);
			}
		} else {
			if (!response.ok) {
				const text = await response.text().catch(() => "");
				throw new Error(text || `HTTP ${response.status}`);
			}
		}
	},

	async deleteItem(itemPath: string): Promise<void> {
		const response = await fetch(`${API_BASE}/files/${encodeURIComponent(itemPath)}`, {
			method: "DELETE",
		});
		const result = (await response.json()) as ApiResponse;
		if (!result.success) throw new Error(result.error);
	},

	async renameItem(oldPath: string, newName: string): Promise<any> {
		const response = await fetch(`${API_BASE}/files/rename/${encodeURIComponent(oldPath)}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ newName }),
		});
		const result = (await response.json()) as ApiResponse;
		if (!result.success) throw new Error(result.error);
		return result.data;
	},

	async reorder(parentPath: string | undefined, orderedNames: string[]): Promise<void> {
		const response = await fetch(`${API_BASE}/files/reorder`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ parentPath: parentPath || "", orderedNames }),
		});
		const result = (await response.json()) as ApiResponse;
		if (!result.success) throw new Error(result.error);
	},

	async moveItem(sourcePath: string, targetParentPath?: string): Promise<any> {
		const response = await fetch(`${API_BASE}/files/move`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ sourcePath, targetParentPath }),
		});
		const result = (await response.json()) as ApiResponse;
		if (!result.success) throw new Error(result.error);
		return result.data;
	},

	async setFolderColor(folderPath: string, color?: string): Promise<void> {
		const response = await fetch(`${API_BASE}/files/folder-color`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ folderPath, color }),
		});
		const result = (await response.json()) as ApiResponse;
		if (!result.success) throw new Error(result.error);
	},

	async uploadFile(
		file: File,
		parentPath?: string,
		useAssetsSubdir: boolean = true,
	): Promise<{ path: string; name: string }> {
		const form = new FormData();
		form.append("file", file);
		if (parentPath) form.append("parentPath", parentPath);
		form.append("useAssetsSubdir", String(useAssetsSubdir));

		const response = await fetch(`${API_BASE}/files/upload`, {
			method: "POST",
			body: form,
		});
		const ct = response.headers.get("content-type") || "";
		if (ct.includes("application/json")) {
			const result = (await response.json()) as ApiResponse;
			if (!response.ok || !result.success) {
				throw new Error(result.error || `HTTP ${response.status}`);
			}
			return result.data;
		}
		if (!response.ok) {
			const text = await response.text().catch(() => "");
			throw new Error(text || `HTTP ${response.status}`);
		}
		throw new Error("Unexpected response from server");
	},

	getRawFileUrl(relativePath: string): string {
		return `${API_BASE}/files/raw/${encodeURIComponent(relativePath)}`;
	},
};

export const knowledgeApi = {
	async getKnowledgeGraph(): Promise<{ nodes: any[]; links: any[] }> {
		const response = await fetch(`${API_BASE}/knowledge/graph`);
		const result = (await response.json()) as ApiResponse;
		if (!result.success) throw new Error(result.error);
		return result.data || { nodes: [], links: [] };
	},

	async getRelatedFiles(filePath: string): Promise<any[]> {
		const response = await fetch(`${API_BASE}/knowledge/related/${encodeURIComponent(filePath)}`);
		const result = (await response.json()) as ApiResponse;
		if (!result.success) throw new Error(result.error);
		return result.data || [];
	},

	async searchFiles(query: string): Promise<Array<{ path: string; name: string; snippet: string; line: number }>> {
		const response = await fetch(`${API_BASE}/knowledge/search?q=${encodeURIComponent(query)}`);
		const result = (await response.json()) as ApiResponse;
		if (!result.success) throw new Error(result.error);
		return (result.data as any[]) || [];
	},
};

export const healthCheck = async (): Promise<boolean> => {
	try {
		const response = await fetch(`${API_BASE}/health`);
		const result = (await response.json()) as { status: string };
		return result.status === "ok";
	} catch {
		return false;
	}
};
