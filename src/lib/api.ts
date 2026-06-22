export type ApiUser = {
  id: string;
  email: string;
  displayName: string;
};

export type ApiMedia = {
  id: string;
  noteId: string;
  kind: "image" | "audio" | "video";
  name: string;
  url: string;
};

export type ApiNote = {
  id: string;
  title: string;
  preview: string;
  content: string;
  folder: string;
  pinned: boolean;
  deleted: boolean;
  updatedAt: string;
  media: ApiMedia[];
};

type AuthResponse = {
  token: string;
  user: ApiUser;
};

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const TOKEN_KEY = "shiguang-token";

const endpoint = (path: string) => `${API_BASE}${path}`;

export const getToken = () => localStorage.getItem(TOKEN_KEY);

export const setToken = (token: string | null) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }
  if (token) headers.set("authorization", `Bearer ${token}`);

  const response = await fetch(endpoint(path), { ...init, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `请求失败：${response.status}`);
  }
  return data as T;
}

export const api = {
  async login(email: string, password: string) {
    return request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  async register(email: string, password: string, displayName: string) {
    return request<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, displayName }),
    });
  },

  async me() {
    return request<{ user: ApiUser }>("/api/auth/me");
  },

  async listNotes() {
    return request<{ notes: ApiNote[] }>("/api/notes");
  },

  async createNote(folder: string) {
    return request<{ note: ApiNote }>("/api/notes", {
      method: "POST",
      body: JSON.stringify({ folder }),
    });
  },

  async updateNote(note: ApiNote) {
    return request<{ note: ApiNote }>(`/api/notes/${note.id}`, {
      method: "PUT",
      body: JSON.stringify(note),
    });
  },

  async upload(noteId: string, file: File | Blob, name: string, type: string) {
    const form = new FormData();
    form.set("file", file, name);
    form.set("name", name);
    form.set("type", type);
    return request<{ media: ApiMedia }>(`/api/notes/${noteId}/attachments`, {
      method: "POST",
      body: form,
    });
  },

  async removeMedia(mediaId: string) {
    return request<{ ok: true }>(`/api/attachments/${mediaId}`, { method: "DELETE" });
  },
};
