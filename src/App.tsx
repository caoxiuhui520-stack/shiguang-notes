import {
  ArchiveRestore, Bold, Check, CheckCircle2, ChevronLeft, Clock3, FileAudio,
  FileImage, FileVideo, Folder, FolderOpen, ImagePlus, Italic, List, ListChecks,
  LoaderCircle, LogOut, Menu, Mic, Moon, MoreHorizontal, Paperclip, PenLine,
  Pin, Play, Plus, Search, Share2, Square, Sun, Trash2, Underline, Video, X,
} from "lucide-react";
import type { Session, User } from "@supabase/supabase-js";
import {
  ChangeEvent, FormEvent, startTransition, useCallback, useDeferredValue,
  useEffect, useMemo, useRef, useState,
} from "react";
import { supabase } from "./lib/supabase";

type MediaItem = {
  id: string;
  kind: "image" | "audio" | "video";
  name: string;
  url: string;
  storagePath: string;
};

type Note = {
  id: string;
  title: string;
  preview: string;
  content: string;
  folder: string;
  updated: string;
  updatedAt: string;
  pinned: boolean;
  deleted: boolean;
  media: MediaItem[];
};

type NoteRow = {
  id: string;
  title: string;
  preview: string;
  content: string;
  folder_name: string;
  is_pinned: boolean;
  deleted_at: string | null;
  updated_at: string;
};

type AttachmentRow = {
  id: string;
  note_id: string;
  kind: MediaItem["kind"];
  storage_path: string;
  file_name: string;
};

const defaultNotes = [
  {
    title: "东京旅行清单",
    preview: "四月的东京，想把行程留得松一点。",
    content:
      "四月的东京，大概会有一点凉。\n\n想把行程留得松一点，不赶景点，只去真正想去的地方。\n\n□ 预订镰仓一日通票\n□ 找一家能看到晴空塔的咖啡店\n□ 去代官山逛旧书店\n□ 给家人带伴手礼",
    folder_name: "生活",
    is_pinned: true,
  },
  {
    title: "关于留白的灵感",
    preview: "好的设计不是添加更多，而是让真正重要的东西被看见。",
    content:
      "好的设计不是添加更多，而是让真正重要的东西被看见。\n\n界面应该像一张安静的桌子：工具都在手边，但不会抢走注意力。",
    folder_name: "灵感",
    is_pinned: true,
  },
  {
    title: "周五产品会议",
    preview: "同步新版编辑器进度，确认媒体上传限制。",
    content: "会议议题\n\n1. 新版编辑器进度\n2. 媒体上传限制\n3. 离线同步策略\n4. 下周发布节奏",
    folder_name: "工作",
    is_pinned: false,
  },
];

const folders = [
  { name: "全部备忘录", icon: FolderOpen },
  { name: "置顶", icon: Pin },
  { name: "最近删除", icon: Trash2 },
  { name: "工作", icon: Folder },
  { name: "灵感", icon: Folder },
  { name: "生活", icon: Folder },
];

const relativeDate = (value: string) => {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (date.toDateString() === new Date().toDateString()) {
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
};

const safeFileName = (name: string) =>
  name.normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-");

const authErrorMessage = (message: string) => {
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "无法连接 Supabase。请检查代理/VPN/网络，或把 *.supabase.co 加入代理规则后重试。";
  }
  if (/invalid login credentials/i.test(message)) {
    return "邮箱或密码不正确。";
  }
  return message;
};

async function hydrateNotes(rows: NoteRow[]): Promise<Note[]> {
  if (!rows.length) return [];
  const noteIds = rows.map((row) => row.id);
  const { data: attachments, error } = await supabase
    .from("memo_attachments")
    .select("id,note_id,kind,storage_path,file_name")
    .in("note_id", noteIds);
  if (error) throw error;

  const mediaByNote = new Map<string, MediaItem[]>();
  await Promise.all(
    ((attachments ?? []) as AttachmentRow[]).map(async (item) => {
      const { data } = await supabase.storage
        .from("memo-attachments")
        .createSignedUrl(item.storage_path, 3600);
      const media: MediaItem = {
        id: item.id,
        kind: item.kind,
        name: item.file_name,
        storagePath: item.storage_path,
        url: data?.signedUrl ?? "",
      };
      mediaByNote.set(item.note_id, [...(mediaByNote.get(item.note_id) ?? []), media]);
    }),
  );

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    preview: row.preview,
    content: row.content,
    folder: row.folder_name,
    updated: relativeDate(row.updated_at),
    updatedAt: row.updated_at,
    pinned: row.is_pinned,
    deleted: Boolean(row.deleted_at),
    media: mediaByNote.get(row.id) ?? [],
  }));
}

function Login({ onSession }: { onSession: (session: Session) => void }) {
  const [registering, setRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    if (registering) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: name.trim() || "拾光用户" } },
      });
      if (error) setMessage(authErrorMessage(error.message));
      else if (data.session) onSession(data.session);
      else setMessage("注册成功，请打开邮箱完成验证后登录。");
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(authErrorMessage(error.message));
      else if (data.session) onSession(data.session);
    }
    setLoading(false);
  };

  return (
    <main className="login-page view-enter">
      <section className="login-panel">
        <div className="brand-mark"><PenLine size={28} strokeWidth={2.2} /></div>
        <h1>拾光备忘</h1>
        <p>把灵感、声音和生活片段，安静地留在这里。</p>
        <form onSubmit={submit}>
          {registering ? (
            <input aria-label="昵称" autoComplete="name" placeholder="你的昵称" value={name} onChange={(e) => setName(e.target.value)} required />
          ) : null}
          <input aria-label="邮箱" type="email" autoComplete="email" placeholder="邮箱地址" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input aria-label="密码" type="password" autoComplete={registering ? "new-password" : "current-password"} minLength={6} placeholder="至少 6 位密码" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {message ? <div className="auth-message" role="status">{message}</div> : null}
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? <LoaderCircle className="spin" size={18} /> : null}
            {registering ? "创建账户" : "登录并同步"}
          </button>
        </form>
        <button className="text-button" onClick={() => { setRegistering(!registering); setMessage(""); }}>
          {registering ? "已有账户？返回登录" : "还没有账户？立即注册"}
        </button>
        <div className="login-note"><CheckCircle2 size={15} /><span>内容通过 Supabase 安全同步</span></div>
      </section>
    </main>
  );
}

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <div className="brand-mark"><PenLine size={27} /></div>
      <LoaderCircle className="spin" size={20} />
    </main>
  );
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [folder, setFolder] = useState("全部备忘录");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [dark, setDark] = useState(() => localStorage.getItem("shiguang-theme") === "dark");
  const [mobileView, setMobileView] = useState<"folders" | "notes" | "editor">("notes");
  const [saveState, setSaveState] = useState("已同步");
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [uploading, setUploading] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);

  const user = session?.user ?? null;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("shiguang-theme", dark ? "dark" : "light");
  }, [dark]);

  const loadNotes = useCallback(async (activeUser: User, quietly = false) => {
    if (!quietly) setLoadingNotes(true);
    const { data, error } = await supabase
      .from("memo_notes")
      .select("id,title,preview,content,folder_name,is_pinned,deleted_at,updated_at")
      .eq("user_id", activeUser.id)
      .order("updated_at", { ascending: false });
    if (error) {
      setSaveState("同步失败");
      setLoadingNotes(false);
      return;
    }

    let rows = (data ?? []) as NoteRow[];
    if (!rows.length) {
      const { data: seeded, error: seedError } = await supabase
        .from("memo_notes")
        .insert(defaultNotes.map((note) => ({ ...note, user_id: activeUser.id })))
        .select("id,title,preview,content,folder_name,is_pinned,deleted_at,updated_at");
      if (!seedError) rows = (seeded ?? []) as NoteRow[];
    }

    const hydrated = await hydrateNotes(rows);
    startTransition(() => {
      setNotes(hydrated);
      setSelectedId((current) => current || hydrated[0]?.id || "");
      setLoadingNotes(false);
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setNotes([]);
      return;
    }
    void loadNotes(user);
    const channel = supabase
      .channel(`memo-notes-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "memo_notes", filter: `user_id=eq.${user.id}` },
        () => void loadNotes(user, true),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadNotes, user]);

  const visibleNotes = useMemo(() => notes
    .filter((note) => {
      if (folder === "最近删除") return note.deleted;
      if (note.deleted) return false;
      if (folder === "置顶") return note.pinned;
      if (!["全部备忘录", "置顶"].includes(folder)) return note.folder === folder;
      return true;
    })
    .filter((note) => `${note.title} ${note.preview} ${note.content}`.toLowerCase().includes(deferredQuery.toLowerCase()))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt)),
  [deferredQuery, folder, notes]);

  const selected = notes.find((note) => note.id === selectedId) ?? visibleNotes[0];

  const persistNote = useCallback(async (note: Note) => {
    setSaveState("正在同步...");
    const { error } = await supabase.from("memo_notes").update({
      title: note.title,
      preview: note.preview,
      content: note.content,
      folder_name: note.folder,
      is_pinned: note.pinned,
      deleted_at: note.deleted ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq("id", note.id);
    setSaveState(error ? "同步失败" : "已同步");
  }, []);

  const updateSelected = (patch: Partial<Note>) => {
    if (!selected) return;
    const next = { ...selected, ...patch, updated: "刚刚", updatedAt: new Date().toISOString() };
    setNotes((items) => items.map((note) => note.id === selected.id ? next : note));
    setSaveState("正在保存...");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void persistNote(next), 550);
  };

  const createNote = async () => {
    if (!user) return;
    const folderName = ["工作", "灵感", "生活"].includes(folder) ? folder : "生活";
    const { data, error } = await supabase.from("memo_notes").insert({
      user_id: user.id,
      title: "新备忘录",
      preview: "开始记录...",
      content: "",
      folder_name: folderName,
    }).select("id,title,preview,content,folder_name,is_pinned,deleted_at,updated_at").single();
    if (error || !data) return setSaveState("同步失败");
    const note = (await hydrateNotes([data as NoteRow]))[0];
    setNotes((items) => [note, ...items]);
    setSelectedId(note.id);
    setMobileView("editor");
  };

  const deleteOrRestore = () => {
    if (!selected) return;
    updateSelected({ deleted: !selected.deleted });
    setMobileView("notes");
  };

  const uploadBlob = async (file: File | Blob, fileName: string, type: string) => {
    if (!user || !selected) return;
    setUploading(true);
    const kind: MediaItem["kind"] = type.startsWith("image/")
      ? "image" : type.startsWith("video/") ? "video" : "audio";
    const attachmentId = crypto.randomUUID();
    const path = `${user.id}/${selected.id}/${attachmentId}/${safeFileName(fileName)}`;
    const { error: uploadError } = await supabase.storage
      .from("memo-attachments")
      .upload(path, file, { contentType: type, upsert: false });
    if (uploadError) {
      setUploading(false);
      return setSaveState("上传失败");
    }
    const { data: row, error: rowError } = await supabase.from("memo_attachments").insert({
      id: attachmentId,
      user_id: user.id,
      note_id: selected.id,
      kind,
      storage_path: path,
      file_name: fileName,
      mime_type: type,
      size_bytes: file.size,
    }).select("id").single();
    if (rowError || !row) {
      await supabase.storage.from("memo-attachments").remove([path]);
      setUploading(false);
      return setSaveState("上传失败");
    }
    const { data: signed } = await supabase.storage.from("memo-attachments").createSignedUrl(path, 3600);
    const media: MediaItem = { id: attachmentId, kind, name: fileName, storagePath: path, url: signed?.signedUrl ?? "" };
    setNotes((items) => items.map((note) => note.id === selected.id ? { ...note, media: [...note.media, media] } : note));
    setUploading(false);
    setSaveState("已同步");
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    for (const file of Array.from(event.target.files ?? [])) {
      await uploadBlob(file, file.name, file.type || "application/octet-stream");
    }
    event.target.value = "";
  };

  const removeMedia = async (item: MediaItem) => {
    if (!selected) return;
    const [{ error: fileError }, { error: rowError }] = await Promise.all([
      supabase.storage.from("memo-attachments").remove([item.storagePath]),
      supabase.from("memo_attachments").delete().eq("id", item.id),
    ]);
    if (fileError || rowError) return setSaveState("删除失败");
    setNotes((items) => items.map((note) =>
      note.id === selected.id ? { ...note, media: note.media.filter((media) => media.id !== item.id) } : note,
    ));
  };

  const toggleRecording = async () => {
    if (recording && recorderRef.current) {
      recorderRef.current.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => chunksRef.current.push(event.data);
      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const name = `录音-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.webm`;
        void uploadBlob(blob, name, type);
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      setSaveState("无法访问麦克风");
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  if (!authReady) return <LoadingScreen />;
  if (!session) return <Login onSession={setSession} />;

  const displayName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "拾光用户";
  const initial = displayName.slice(0, 1).toUpperCase();

  return (
    <main className="app-shell view-enter">
      <aside className={`sidebar ${mobileView !== "folders" ? "mobile-hidden" : ""}`}>
        <div className="brand"><div className="brand-mark small"><PenLine size={19} /></div><strong>拾光备忘</strong></div>
        <div className="profile">
          <div className="avatar">{initial}</div>
          <div><strong>{displayName}</strong><span><Check size={12} /> 云端已连接</span></div>
          <MoreHorizontal size={19} />
        </div>
        <button className="new-note" onClick={() => void createNote()}><Plus size={18} /> 新建备忘录</button>
        <nav>
          <span className="nav-label">资料库</span>
          {folders.slice(0, 3).map(({ name, icon: Icon }) => (
            <button key={name} className={folder === name ? "active" : ""} onClick={() => { setFolder(name); setMobileView("notes"); }}>
              <Icon size={18} /><span>{name}</span><b>{name === "全部备忘录" ? notes.filter((n) => !n.deleted).length : ""}</b>
            </button>
          ))}
          <span className="nav-label custom-label">我的文件夹</span>
          {folders.slice(3).map(({ name, icon: Icon }) => (
            <button key={name} className={folder === name ? "active" : ""} onClick={() => { setFolder(name); setMobileView("notes"); }}>
              <Icon size={18} /><span>{name}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button onClick={() => setDark(!dark)}>{dark ? <Sun size={17} /> : <Moon size={17} />}{dark ? "浅色模式" : "深色模式"}</button>
          <button onClick={() => void signOut()}><LogOut size={17} /> 退出登录</button>
        </div>
      </aside>

      <section className={`note-list ${mobileView !== "notes" ? "mobile-hidden" : ""}`}>
        <header>
          <button className="mobile-menu" onClick={() => setMobileView("folders")} aria-label="打开文件夹"><Menu size={21} /></button>
          <div><h2>{folder}</h2><span>{visibleNotes.length} 条备忘录</span></div>
          <button className="icon-button mobile-new" onClick={() => void createNote()} aria-label="新建备忘录"><PenLine size={20} /></button>
        </header>
        <label className="search-box"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索备忘录" />{query ? <X size={16} onClick={() => setQuery("")} /> : null}</label>
        <div className={`note-rows ${loadingNotes ? "is-loading" : ""}`}>
          {loadingNotes ? <div className="list-loading"><LoaderCircle className="spin" size={21} /> 正在同步</div> : null}
          {visibleNotes.map((note) => (
            <button key={note.id} className={`note-row ${selected?.id === note.id ? "selected" : ""}`} onClick={() => { setSelectedId(note.id); setMobileView("editor"); }}>
              <div className="row-top"><strong>{note.title || "无标题"}</strong><span>{note.updated}</span></div>
              <p>{note.preview || "开始记录..."}</p>
              <div className="row-meta">
                {note.pinned ? <Pin size={12} fill="currentColor" /> : null}<span>{note.folder}</span>
                {note.media.some((m) => m.kind === "image") ? <FileImage size={13} /> : null}
                {note.media.some((m) => m.kind === "audio") ? <FileAudio size={13} /> : null}
                {note.media.some((m) => m.kind === "video") ? <FileVideo size={13} /> : null}
              </div>
            </button>
          ))}
          {!loadingNotes && !visibleNotes.length ? <div className="empty-list"><FolderOpen size={28} /><strong>这里还没有备忘录</strong><span>记录一个刚刚闪过的念头吧</span></div> : null}
        </div>
      </section>

      <section className={`editor ${mobileView !== "editor" ? "mobile-hidden" : ""}`}>
        {selected ? (
          <>
            <header className="editor-topbar">
              <button className="mobile-back" onClick={() => setMobileView("notes")}><ChevronLeft size={22} /><span>备忘录</span></button>
              <div className="editor-tools">
                <button title="加粗"><Bold size={17} /></button><button title="斜体"><Italic size={17} /></button><button title="下划线"><Underline size={17} /></button>
                <span /><button title="列表"><List size={18} /></button><button title="待办清单"><ListChecks size={18} /></button>
              </div>
              <div className="editor-actions">
                <button className={selected.pinned ? "highlighted" : ""} onClick={() => updateSelected({ pinned: !selected.pinned })} title="置顶"><Pin size={18} /></button>
                <button onClick={() => fileRef.current?.click()} title="上传附件"><Paperclip size={18} /></button>
                <button title="分享"><Share2 size={18} /></button>
                <button onClick={deleteOrRestore} title={selected.deleted ? "恢复" : "删除"}>{selected.deleted ? <ArchiveRestore size={18} /> : <Trash2 size={18} />}</button>
                <button title="更多"><MoreHorizontal size={18} /></button>
              </div>
            </header>
            <article className="note-document note-enter" key={selected.id}>
              <div className="document-status">
                <span><Clock3 size={13} /> {relativeDate(selected.updatedAt)}</span>
                <span className={saveState === "已同步" ? "saved" : saveState.includes("失败") ? "failed" : ""}>
                  {saveState.includes("同步") && saveState !== "已同步" ? <LoaderCircle className="spin" size={13} /> : saveState === "已同步" ? <Check size={13} /> : null}
                  {uploading ? "正在上传..." : saveState}
                </span>
              </div>
              <input className="title-input" value={selected.title} onChange={(e) => updateSelected({ title: e.target.value, preview: e.target.value })} />
              <textarea className="content-input" value={selected.content} onChange={(e) => updateSelected({ content: e.target.value, preview: e.target.value.replace(/\n/g, " ").slice(0, 80) || "开始记录..." })} placeholder="开始书写..." />
              {selected.media.length ? (
                <div className="media-grid">
                  {selected.media.map((item) => (
                    <div className={`media-card ${item.kind} media-enter`} key={item.id}>
                      {item.kind === "image" ? <img src={item.url} alt={item.name} /> : null}
                      {item.kind === "audio" ? <div className="audio-card"><button><Play size={17} fill="currentColor" /></button><div><strong>{item.name}</strong><audio controls src={item.url} /></div></div> : null}
                      {item.kind === "video" ? <video controls src={item.url} /> : null}
                      <button className="remove-media" onClick={() => void removeMedia(item)}><X size={14} /></button>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="attachment-actions">
                <button onClick={() => fileRef.current?.click()} disabled={uploading}><ImagePlus size={18} /> 添加图片</button>
                <button className={recording ? "recording" : ""} onClick={() => void toggleRecording()} disabled={uploading}>
                  {recording ? <Square size={16} fill="currentColor" /> : <Mic size={18} />}{recording ? "停止录音" : "录音"}
                </button>
                <button onClick={() => fileRef.current?.click()} disabled={uploading}><Video size={18} /> 添加视频</button>
              </div>
              <input ref={fileRef} className="file-input" type="file" multiple accept="image/*,audio/*,video/*" onChange={(event) => void handleUpload(event)} />
            </article>
          </>
        ) : (
          <div className="empty-editor"><PenLine size={32} /><strong>选择一条备忘录</strong><span>或者创建一条新的记录</span><button className="primary-button" onClick={() => void createNote()}>新建备忘录</button></div>
        )}
      </section>
    </main>
  );
}

export default App;
