export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  JWT_SECRET: string;
}

type User = {
  id: string;
  email: string;
  display_name: string;
};

type NoteRow = {
  id: string;
  title: string;
  preview: string;
  content: string;
  folder: string;
  pinned: number;
  deleted: number;
  updated_at: string;
};

type AttachmentRow = {
  id: string;
  note_id: string;
  kind: "image" | "audio" | "video";
  file_name: string;
  mime_type: string;
};

const defaultNotes = [
  {
    title: "东京旅行清单",
    preview: "四月的东京，想把行程留得松一点。",
    content:
      "四月的东京，大概会有一点凉。\n\n想把行程留得松一点，不赶景点，只去真正想去的地方。\n\n□ 预订镰仓一日通票\n□ 找一家能看到晴空塔的咖啡店\n□ 去代官山逛旧书店\n□ 给家人带伴手礼",
    folder: "生活",
    pinned: 1,
  },
  {
    title: "关于留白的灵感",
    preview: "好的设计不是添加更多，而是让真正重要的东西被看见。",
    content:
      "好的设计不是添加更多，而是让真正重要的东西被看见。\n\n界面应该像一张安静的桌子：工具都在手边，但不会抢走注意力。",
    folder: "灵感",
    pinned: 1,
  },
  {
    title: "周五产品会议",
    preview: "同步新版编辑器进度，确认媒体上传限制。",
    content: "会议议题\n\n1. 新版编辑器进度\n2. 媒体上传限制\n3. 离线同步策略\n4. 下周发布节奏",
    folder: "工作",
    pinned: 0,
  },
];

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
  });

const bad = (error: string, status = 400) => json({ error }, status);

const enc = new TextEncoder();

const b64url = (input: ArrayBuffer | string) => {
  const bytes = typeof input === "string" ? enc.encode(input) : new Uint8Array(input);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromB64url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(normalized);
};

async function hmac(secret: string, payload: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
}

async function signToken(env: Env, user: User) {
  const payload = b64url(JSON.stringify({
    sub: user.id,
    email: user.email,
    displayName: user.display_name,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  }));
  return `${payload}.${await hmac(env.JWT_SECRET, payload)}`;
}

async function verifyToken(env: Env, token: string | null) {
  if (!token || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  if (await hmac(env.JWT_SECRET, payload) !== signature) return null;
  const claims = JSON.parse(fromB64url(payload)) as { sub: string; email: string; displayName: string; exp: number };
  if (claims.exp < Math.floor(Date.now() / 1000)) return null;
  return { id: claims.sub, email: claims.email, display_name: claims.displayName };
}

async function hashPassword(password: string, salt = crypto.randomUUID()) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 100_000 },
    key,
    256,
  );
  return { salt, hash: b64url(bits) };
}

async function currentUser(request: Request, env: Env) {
  const auth = request.headers.get("authorization");
  const url = new URL(request.url);
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : url.searchParams.get("token");
  return verifyToken(env, token);
}

function noteFromRow(row: NoteRow, media: AttachmentRow[], token: string) {
  return {
    id: row.id,
    title: row.title,
    preview: row.preview,
    content: row.content,
    folder: row.folder,
    pinned: Boolean(row.pinned),
    deleted: Boolean(row.deleted),
    updatedAt: row.updated_at,
    media: media.filter((item) => item.note_id === row.id).map((item) => ({
      id: item.id,
      noteId: item.note_id,
      kind: item.kind,
      name: item.file_name,
      url: `/api/files/${item.id}?token=${encodeURIComponent(token)}`,
    })),
  };
}

async function ensureSeedNotes(env: Env, userId: string) {
  const count = await env.DB.prepare("select count(*) as total from notes where user_id = ?").bind(userId).first<{ total: number }>();
  if ((count?.total ?? 0) > 0) return;
  const now = new Date().toISOString();
  await env.DB.batch(defaultNotes.map((note) =>
    env.DB.prepare(
      "insert into notes (id, user_id, title, preview, content, folder, pinned, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(crypto.randomUUID(), userId, note.title, note.preview, note.content, note.folder, note.pinned, now),
  ));
}

async function listNotes(request: Request, env: Env, user: User) {
  await ensureSeedNotes(env, user.id);
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const { results: notes } = await env.DB.prepare(
    "select id, title, preview, content, folder, pinned, deleted, updated_at from notes where user_id = ? order by updated_at desc",
  ).bind(user.id).all<NoteRow>();
  const { results: media } = await env.DB.prepare(
    "select id, note_id, kind, file_name, mime_type from attachments where user_id = ? order by created_at asc",
  ).bind(user.id).all<AttachmentRow>();
  return json({ notes: notes.map((note) => noteFromRow(note, media, token)) });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/api/auth/register" && request.method === "POST") {
        const body = await request.json<{ email: string; password: string; displayName?: string }>();
        const email = body.email?.trim().toLowerCase();
        if (!email || !body.password || body.password.length < 6) return bad("邮箱和至少 6 位密码是必填项");
        const exists = await env.DB.prepare("select id from users where email = ?").bind(email).first();
        if (exists) return bad("email already exists", 409);
        const { salt, hash } = await hashPassword(body.password);
        const user: User = { id: crypto.randomUUID(), email, display_name: body.displayName?.trim() || "拾光用户" };
        await env.DB.prepare(
          "insert into users (id, email, display_name, password_salt, password_hash) values (?, ?, ?, ?, ?)",
        ).bind(user.id, user.email, user.display_name, salt, hash).run();
        return json({ token: await signToken(env, user), user: { id: user.id, email: user.email, displayName: user.display_name } });
      }

      if (path === "/api/auth/login" && request.method === "POST") {
        const body = await request.json<{ email: string; password: string }>();
        const row = await env.DB.prepare(
          "select id, email, display_name, password_salt, password_hash from users where email = ?",
        ).bind(body.email?.trim().toLowerCase()).first<User & { password_salt: string; password_hash: string }>();
        if (!row) return bad("invalid credentials", 401);
        const { hash } = await hashPassword(body.password ?? "", row.password_salt);
        if (hash !== row.password_hash) return bad("invalid credentials", 401);
        const user = { id: row.id, email: row.email, display_name: row.display_name };
        return json({ token: await signToken(env, user), user: { id: user.id, email: user.email, displayName: user.display_name } });
      }

      const user = await currentUser(request, env);
      if (!user) return bad("未登录或登录已过期", 401);

      if (path === "/api/auth/me" && request.method === "GET") {
        return json({ user: { id: user.id, email: user.email, displayName: user.display_name } });
      }

      if (path === "/api/notes" && request.method === "GET") {
        return listNotes(request, env, user);
      }

      if (path === "/api/notes" && request.method === "POST") {
        const body = await request.json<{ folder?: string }>();
        const now = new Date().toISOString();
        const id = crypto.randomUUID();
        await env.DB.prepare(
          "insert into notes (id, user_id, title, preview, content, folder, updated_at) values (?, ?, ?, ?, ?, ?, ?)",
        ).bind(id, user.id, "新备忘录", "开始记录...", "", body.folder || "生活", now).run();
        return json({ note: { id, title: "新备忘录", preview: "开始记录...", content: "", folder: body.folder || "生活", pinned: false, deleted: false, updatedAt: now, media: [] } });
      }

      const noteMatch = path.match(/^\/api\/notes\/([^/]+)$/);
      if (noteMatch && request.method === "PUT") {
        const id = noteMatch[1];
        const body = await request.json<{ title: string; preview: string; content: string; folder: string; pinned: boolean; deleted: boolean }>();
        const now = new Date().toISOString();
        await env.DB.prepare(
          "update notes set title = ?, preview = ?, content = ?, folder = ?, pinned = ?, deleted = ?, updated_at = ? where id = ? and user_id = ?",
        ).bind(body.title || "", body.preview || "", body.content || "", body.folder || "生活", body.pinned ? 1 : 0, body.deleted ? 1 : 0, now, id, user.id).run();
        const row = await env.DB.prepare(
          "select id, title, preview, content, folder, pinned, deleted, updated_at from notes where id = ? and user_id = ?",
        ).bind(id, user.id).first<NoteRow>();
        if (!row) return bad("备忘录不存在", 404);
        const { results: media } = await env.DB.prepare(
          "select id, note_id, kind, file_name, mime_type from attachments where user_id = ? and note_id = ? order by created_at asc",
        ).bind(user.id, id).all<AttachmentRow>();
        return json({ note: noteFromRow(row, media, (request.headers.get("authorization") ?? "").replace(/^Bearer /, "")) });
      }

      const uploadMatch = path.match(/^\/api\/notes\/([^/]+)\/attachments$/);
      if (uploadMatch && request.method === "POST") {
        const noteId = uploadMatch[1];
        const note = await env.DB.prepare("select id from notes where id = ? and user_id = ?").bind(noteId, user.id).first();
        if (!note) return bad("备忘录不存在", 404);
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File)) return bad("缺少文件");
        const type = file.type || String(form.get("type") || "application/octet-stream");
        const kind = type.startsWith("image/") ? "image" : type.startsWith("video/") ? "video" : "audio";
        const id = crypto.randomUUID();
        const objectKey = `${user.id}/${noteId}/${id}/${file.name.replace(/[^\w.\-\u4e00-\u9fa5]+/g, "-")}`;
        await env.FILES.put(objectKey, file.stream(), { httpMetadata: { contentType: type } });
        await env.DB.prepare(
          "insert into attachments (id, user_id, note_id, kind, object_key, file_name, mime_type, size_bytes) values (?, ?, ?, ?, ?, ?, ?, ?)",
        ).bind(id, user.id, noteId, kind, objectKey, String(form.get("name") || file.name), type, file.size).run();
        const token = (request.headers.get("authorization") || "").replace(/^Bearer /, "");
        return json({ media: { id, noteId, kind, name: file.name, url: `/api/files/${id}?token=${encodeURIComponent(token)}` } });
      }

      const fileMatch = path.match(/^\/api\/files\/([^/]+)$/);
      if (fileMatch && request.method === "GET") {
        const row = await env.DB.prepare(
          "select object_key, mime_type, file_name from attachments where id = ? and user_id = ?",
        ).bind(fileMatch[1], user.id).first<{ object_key: string; mime_type: string; file_name: string }>();
        if (!row) return bad("文件不存在", 404);
        const object = await env.FILES.get(row.object_key);
        if (!object) return bad("文件不存在", 404);
        return new Response(object.body, {
          headers: {
            ...corsHeaders,
            "content-type": row.mime_type,
            "cache-control": "private, max-age=3600",
            "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,
          },
        });
      }

      const mediaMatch = path.match(/^\/api\/attachments\/([^/]+)$/);
      if (mediaMatch && request.method === "DELETE") {
        const row = await env.DB.prepare("select object_key from attachments where id = ? and user_id = ?")
          .bind(mediaMatch[1], user.id).first<{ object_key: string }>();
        if (row) await env.FILES.delete(row.object_key);
        await env.DB.prepare("delete from attachments where id = ? and user_id = ?").bind(mediaMatch[1], user.id).run();
        return json({ ok: true });
      }

      return bad("Not found", 404);
    } catch (error) {
      return bad(error instanceof Error ? error.message : "服务器错误", 500);
    }
  },
};
