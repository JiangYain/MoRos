export const API_BASE = "http://localhost:53211/api";

// API 响应类型
interface ApiResponse<T = any> {
	success: boolean;
	data?: T;
	error?: string;
	message?: string;
}

// 文件系统 API
export const filesApi = {
	// 获取文件树
	async getFileTree(): Promise<any[]> {
		const response = await fetch(`${API_BASE}/files`);
		const result: ApiResponse = await response.json();
		if (!result.success) throw new Error(result.error);
		return result.data || [];
	},

	// 创建文件夹
	async createFolder(name: string, parentPath?: string): Promise<any> {
		const response = await fetch(`${API_BASE}/files/folder`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name, parentPath }),
		});
		const result: ApiResponse = await response.json();
		if (!result.success) throw new Error(result.error);
		return result.data;
	},

	// 创建文件
	async createFile(name: string, content: string = "", parentPath?: string): Promise<any> {
		const response = await fetch(`${API_BASE}/files/file`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name, content, parentPath }),
		});
		const result: ApiResponse = await response.json();
		if (!result.success) throw new Error(result.error);
		return result.data;
	},

	// 读取文件内容
	async readFile(filePath: string): Promise<string> {
		const response = await fetch(`${API_BASE}/files/content/${encodeURIComponent(filePath)}`);
		const result: ApiResponse = await response.json();
		if (!result.success) throw new Error(result.error);
		return result.data?.content || "";
	},

	// 保存文件内容
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
			const result: ApiResponse = await response.json();
			if (!response.ok || !result.success) {
				throw new Error(result.error || `HTTP ${response.status}`);
			}
		} else {
			// 例如 413 时 body-parser 默认返回 HTML，避免 JSON 解析报错
			if (!response.ok) {
				const text = await response.text().catch(() => "");
				throw new Error(text || `HTTP ${response.status}`);
			}
		}
	},

	// 删除文件或文件夹
	async deleteItem(itemPath: string): Promise<void> {
		const response = await fetch(`${API_BASE}/files/${encodeURIComponent(itemPath)}`, {
			method: "DELETE",
		});
		const result: ApiResponse = await response.json();
		if (!result.success) throw new Error(result.error);
	},

	// 重命名文件或文件夹
	async renameItem(oldPath: string, newName: string): Promise<any> {
		const response = await fetch(`${API_BASE}/files/rename/${encodeURIComponent(oldPath)}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ newName }),
		});
		const result: ApiResponse = await response.json();
		if (!result.success) throw new Error(result.error);
		return result.data;
	},

	// 更新目录内排序
	async reorder(parentPath: string | undefined, orderedNames: string[]): Promise<void> {
		const response = await fetch(`${API_BASE}/files/reorder`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ parentPath: parentPath || "", orderedNames }),
		});
		const result: ApiResponse = await response.json();
		if (!result.success) throw new Error(result.error);
	},

	// 移动文件/文件夹到其他位置
	async moveItem(sourcePath: string, targetParentPath?: string): Promise<any> {
		const response = await fetch(`${API_BASE}/files/move`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ sourcePath, targetParentPath }),
		});
		const result: ApiResponse = await response.json();
		if (!result.success) throw new Error(result.error);
		return result.data;
	},

	// 设置文件夹颜色
	async setFolderColor(folderPath: string, color?: string): Promise<void> {
		const response = await fetch(`${API_BASE}/files/folder-color`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ folderPath, color }),
		});
		const result: ApiResponse = await response.json();
		if (!result.success) throw new Error(result.error);
	},
	// 上传文件（图片）
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
			const result: ApiResponse = await response.json();
			if (!response.ok || !result.success) {
				throw new Error(result.error || `HTTP ${response.status}`);
			}
			return result.data;
		} else {
			// 某些错误情况下（如代理/网关返回HTML）避免 JSON 解析异常
			if (!response.ok) {
				const text = await response.text().catch(() => "");
				throw new Error(text || `HTTP ${response.status}`);
			}
			// 正常情况下后端始终返回 JSON
			throw new Error("Unexpected response from server");
		}
	},

	// 构造原始资源访问 URL（图片等）
	getRawFileUrl(relativePath: string): string {
		return `${API_BASE}/files/raw/${encodeURIComponent(relativePath)}`;
	},
};

// 知识图谱 API
export const knowledgeApi = {
	// 获取知识图谱
	async getKnowledgeGraph(): Promise<{ nodes: any[]; links: any[] }> {
		const response = await fetch(`${API_BASE}/knowledge/graph`);
		const result: ApiResponse = await response.json();
		if (!result.success) throw new Error(result.error);
		return result.data || { nodes: [], links: [] };
	},

	// 获取相关文件
	async getRelatedFiles(filePath: string): Promise<any[]> {
		const response = await fetch(`${API_BASE}/knowledge/related/${encodeURIComponent(filePath)}`);
		const result: ApiResponse = await response.json();
		if (!result.success) throw new Error(result.error);
		return result.data || [];
	},

	// 搜索文件（返回片段）
	async searchFiles(query: string): Promise<Array<{ path: string; name: string; snippet: string; line: number }>> {
		const response = await fetch(`${API_BASE}/knowledge/search?q=${encodeURIComponent(query)}`);
		const result: ApiResponse = await response.json();
		if (!result.success) throw new Error(result.error);
		return (result.data as any[]) || [];
	},
};

// 健康检查
export const healthCheck = async (): Promise<boolean> => {
	try {
		const response = await fetch(`${API_BASE}/health`);
		const result = await response.json();
		return result.status === "ok";
	} catch {
		return false;
	}
};
