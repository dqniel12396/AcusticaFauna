const API_BASE = "http://127.0.0.1:8000/api";

export function buildMediaUrl(filePath) {
  if (!filePath || filePath === "-") return "";
  return `${API_BASE}/media/file?path=${encodeURIComponent(filePath)}`;
}