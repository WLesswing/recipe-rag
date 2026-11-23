"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "recipe-rag-chats";
const STREAM_URL = "http://localhost:8000/stream";

type Role = "user" | "assistant";
type Message = { id: string; role: Role; content: string };
type Chat = { id: string; title: string; messages: Message[]; createdAt: number };

export default function Home() {
  const [ready, setReady] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [streamingIds, setStreamingIds] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [titleMenu, setTitleMenu] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);

  const streamsRef = useRef<Map<string, AbortController>>(new Map());
  const streamingRef = useRef<Set<string>>(new Set());
  const activeRef = useRef<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { chats?: Chat[]; activeId?: string | null };
        if (Array.isArray(saved.chats)) setChats(saved.chats);
        if (typeof saved.activeId === "string" || saved.activeId === null) {
          setActiveId(saved.activeId ?? null);
        }
      }
    } catch {
      /* keep the empty welcome state */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ chats, activeId }));
    } catch {
      /* storage can fill up; the session still works */
    }
  }, [ready, chats, activeId]);

  activeRef.current = activeId;
  const draftKey = activeId ?? "draft:new";
  const draft = drafts[draftKey] ?? "";
  const activeStreaming = activeId ? streamingIds.includes(activeId) : false;

  const active = chats.find((chat) => chat.id === activeId) ?? null;
  const messages = active?.messages ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter(
      (chat) =>
        chat.title.toLowerCase().includes(q) ||
        chat.messages.some((message) => message.content.toLowerCase().includes(q)),
    );
  }, [chats, query]);

  const visible = searching || showAll ? filtered : filtered.slice(0, 8);

  useEffect(() => {
    if (!stickRef.current) return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, activeStreaming, ready]);

  useEffect(() => {
    if (searching) searchRef.current?.focus();
  }, [searching]);

  function resize(el: HTMLTextAreaElement) {
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function setChatStreaming(id: string, on: boolean) {
    const next = new Set(streamingRef.current);
    if (on) next.add(id);
    else next.delete(id);
    streamingRef.current = next;
    setStreamingIds(Array.from(next));
  }

  function stop(id: string | null = activeRef.current) {
    if (!id) return;
    streamsRef.current.get(id)?.abort();
  }

  function openChat(id: string | null) {
    stickRef.current = true;
    activeRef.current = id;
    setActiveId(id);
    setTitleMenu(false);
    setMenuId(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.focus();
    }
  }

  function newChat() {
    openChat(null);
  }

  function removeChat(id: string) {
    stop(id);
    setChats((prev) => prev.filter((chat) => chat.id !== id));
    if (activeRef.current === id) openChat(null);
    setMenuId(null);
    setTitleMenu(false);
  }

  async function ask(text: string) {
    const question = text.trim();
    if (!question) return;

    const chatId = activeRef.current ?? crypto.randomUUID();
    if (streamingRef.current.has(chatId)) return;
    activeRef.current = chatId;
    setChatStreaming(chatId, true);

    setDrafts((prev) => ({ ...prev, [activeId ?? "draft:new"]: "" }));
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    stickRef.current = true;

    const title = titleFrom(question);
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: question };
    const asstMsg: Message = { id: crypto.randomUUID(), role: "assistant", content: "" };

    setChats((prev) => {
      const existing = prev.find((chat) => chat.id === chatId);
      const next: Chat = existing
        ? {
            ...existing,
            title: existing.messages.length === 0 ? title : existing.title,
            messages: [...existing.messages, userMsg, asstMsg],
          }
        : { id: chatId, title, messages: [userMsg, asstMsg], createdAt: Date.now() };
      return [next, ...prev.filter((chat) => chat.id !== chatId)];
    });
    setActiveId(chatId);

    const controller = new AbortController();
    streamsRef.current.set(chatId, controller);
    let received = "";

    const write = (content: string) => {
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages: chat.messages.map((message) =>
                  message.id === asstMsg.id ? { ...message, content } : message,
                ),
              }
            : chat,
        ),
      );
    };

    try {
      const res = await fetch(STREAM_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`The local model returned ${res.status}.`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += decoder.decode(value, { stream: true });
        write(received);
      }
      received += decoder.decode();
      if (!received.trim()) write("The model returned an empty answer.");
      else write(received);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        if (!received.trim()) write("Stopped.");
        return;
      }
      const message =
        error instanceof TypeError
          ? "Can’t reach the local model. Start the FastAPI server on port 8000."
          : error instanceof Error
            ? error.message
            : "Something went wrong talking to the local model.";
      write(received ? `${received}\n\n${message}` : message);
    } finally {
      streamsRef.current.delete(chatId);
      setChatStreaming(chatId, false);
    }
  }

  async function share() {
    const transcript = messages
      .map((message) => `${message.role === "user" ? "You" : "Recipes"}: ${message.content}`)
      .join("\n\n");
    if (!transcript) return;
    try {
      await navigator.clipboard.writeText(transcript);
    } catch {
      /* clipboard can be blocked; the chat is still on screen */
    }
  }

  if (!ready) {
    return <div className="h-dvh bg-background" />;
  }

  const canSend = draft.trim().length > 0 && !activeStreaming;

  return (
    <div className="flex h-dvh bg-background text-foreground">
      {sidebarOpen && (
        <aside className="flex h-full w-[272px] shrink-0 flex-col border-r border-line bg-sidebar">
          <div className="flex items-center gap-1 px-3 pt-3 pb-1">
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="grid size-8 place-items-center rounded-lg text-muted hover:bg-wash hover:text-foreground"
              aria-label="Hide sidebar"
            >
              <Icon name="panel" />
            </button>
            <span className="px-1 text-[15px] font-medium tracking-tight">Recipes</span>
          </div>

          <nav className="px-2 py-1">
            <button
              type="button"
              onClick={newChat}
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[14px] text-foreground hover:bg-wash"
            >
              <Icon name="plus" className="size-[18px] text-muted" />
              New
            </button>
            <button
              type="button"
              onClick={() => {
                setSearching((open) => !open);
                setQuery("");
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[14px] hover:bg-wash ${
                searching ? "bg-wash text-foreground" : "text-foreground"
              }`}
            >
              <Icon name="search" className="size-[18px] text-muted" />
              Search
            </button>
          </nav>

          <div className="mt-3 flex min-h-0 flex-1 flex-col px-2">
            <div className="flex items-center justify-between px-2.5 pb-1">
              <span className="text-[12px] font-medium text-muted">Chats</span>
            </div>
            {searching && (
              <div className="px-1 pb-2">
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search chats"
                  className="w-full rounded-lg bg-wash px-2.5 py-1.5 text-[13px] text-foreground outline-none placeholder:text-faint"
                />
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {visible.length === 0 && (
                <p className="px-2.5 py-2 text-[13px] text-faint">
                  {query.trim() ? "No matching chats" : "No chats yet"}
                </p>
              )}
              {visible.map((chat) => (
                <div key={chat.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => openChat(chat.id)}
                    className={`flex w-full items-center gap-2.5 rounded-lg py-2 pr-8 pl-2.5 text-left text-[14px] hover:bg-wash ${
                      chat.id === activeId ? "bg-wash" : ""
                    }`}
                  >
                    {streamingIds.includes(chat.id) ? (
                      <span className="grid size-4 shrink-0 place-items-center" aria-label="Generating">
                        <span className="size-2 animate-pulse rounded-full bg-accent" />
                      </span>
                    ) : (
                      <Icon name="chat" className="size-4 shrink-0 text-faint" />
                    )}
                    <span className="truncate">{chat.title}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Chat actions for ${chat.title}`}
                    onClick={() => setMenuId((current) => (current === chat.id ? null : chat.id))}
                    className={`absolute top-1 right-1 grid size-7 place-items-center rounded-md text-muted hover:bg-white/10 hover:text-foreground ${
                      menuId === chat.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    <Icon name="more" className="size-4" />
                  </button>
                  {menuId === chat.id && (
                    <>
                      <button
                        type="button"
                        className="fixed inset-0 z-10 cursor-default"
                        aria-label="Close menu"
                        onClick={() => setMenuId(null)}
                      />
                      <div className="absolute top-8 right-1 z-20 w-36 rounded-xl border border-line bg-elevated p-1 shadow-xl">
                        <button
                          type="button"
                          onClick={() => removeChat(chat.id)}
                          className="w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] text-accent hover:bg-wash"
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {!searching && filtered.length > 8 && (
                <button
                  type="button"
                  onClick={() => setShowAll((open) => !open)}
                  className="px-2.5 py-2 text-[13px] text-muted hover:text-foreground"
                >
                  {showAll ? "Show less" : "View all"}
                </button>
              )}
            </div>
          </div>

          <div className="border-t border-line p-2">
            <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
              <span className="grid size-8 shrink-0 place-items-center text-muted">
                <Icon name="user" className="size-7" />
              </span>
              <span className="text-[14px]">Will</span>
            </div>
          </div>
        </aside>
      )}

      <section className="relative flex min-w-0 flex-1 flex-col">
        <header className="relative flex h-12 shrink-0 items-center px-3">
          {!sidebarOpen && (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="grid size-8 place-items-center rounded-lg text-muted hover:bg-wash hover:text-foreground"
              aria-label="Show sidebar"
            >
              <Icon name="panel" />
            </button>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => active && setTitleMenu((open) => !open)}
              className="flex max-w-[240px] items-center gap-1 rounded-lg px-2 py-1 text-[14px] font-medium hover:bg-wash"
            >
              <span className="truncate">{active?.title ?? "New chat"}</span>
              {active && <Icon name="chevron" className="size-3.5 text-muted" />}
            </button>
            {titleMenu && active && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-10 cursor-default"
                  aria-label="Close menu"
                  onClick={() => setTitleMenu(false)}
                />
                <div className="absolute top-9 left-0 z-20 w-36 rounded-xl border border-line bg-elevated p-1 shadow-xl">
                  <button
                    type="button"
                    onClick={() => removeChat(active.id)}
                    className="w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] text-accent hover:bg-wash"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <span className="rounded-full border border-line bg-black/20 px-2.5 py-1 text-[12px] text-muted">
              Local
            </span>
          </div>

          <button
            type="button"
            onClick={share}
            disabled={messages.length === 0}
            className="ml-auto flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] text-muted hover:bg-wash hover:text-foreground disabled:opacity-40"
          >
            <Icon name="share" className="size-4" />
            Share
          </button>
        </header>

        <div
          ref={scrollerRef}
          onScroll={() => {
            const el = scrollerRef.current;
            if (!el) return;
            stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          {messages.length === 0 ? (
            <div className="mx-auto w-full max-w-[640px] px-6 pt-[12vh]">
              <h1 className="text-[26px] font-medium tracking-tight text-foreground">
                Welcome, Will.
              </h1>
              <p className="mt-3 max-w-[520px] text-[15px] leading-relaxed text-muted">
                Bring me a meal, a half-formed idea, something you want to cook. I’ll look
                through your recipes and we’ll figure it out.
              </p>
              <p className="mt-3 text-[15px] text-muted">Where do you want to start?</p>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-4 py-8">
              {messages.map((message) =>
                message.role === "user" ? (
                  <div key={message.id} className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl bg-composer px-4 py-2.5 text-[15px] leading-6 whitespace-pre-wrap">
                      {message.content}
                    </div>
                  </div>
                ) : (
                  <div
                    key={message.id}
                    className="max-w-[680px] text-[15.5px] leading-7 whitespace-pre-wrap text-foreground"
                  >
                    {message.content ? (
                      <RichText text={message.content} />
                    ) : activeStreaming ? (
                      <TypingDots />
                    ) : null}
                    {activeStreaming && message.content && message.id === messages.at(-1)?.id && (
                      <span className="ml-0.5 inline-block h-[1em] w-[7px] translate-y-0.5 bg-foreground/70 align-middle" />
                    )}
                  </div>
                ),
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 px-4 pb-3">
          <form
            className="mx-auto w-full max-w-[720px]"
            onSubmit={(event) => {
              event.preventDefault();
              void ask(draft);
            }}
          >
            <div className="flex items-end gap-1 rounded-[26px] border border-line bg-composer py-1.5 pr-1.5 pl-1.5">
              <button
                type="button"
                onClick={newChat}
                className="mb-0.5 grid size-9 place-items-center rounded-full text-muted hover:bg-wash hover:text-foreground"
                aria-label="New chat"
              >
                <Icon name="plus" />
              </button>
              <textarea
                ref={textareaRef}
                value={draft}
                rows={1}
                placeholder="Tell me what you’re craving"
                className="min-h-10 max-h-40 flex-1 resize-none bg-transparent px-1 py-2 text-[15px] leading-6 outline-none placeholder:text-muted"
                onChange={(event) => {
                  const value = event.target.value;
                  setDrafts((prev) => ({ ...prev, [draftKey]: value }));
                  resize(event.target);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void ask(draft);
                  }
                }}
              />
              {activeStreaming ? (
                <button
                  type="button"
                  onClick={() => stop()}
                  className="mb-0.5 grid size-8 place-items-center rounded-full bg-white text-black"
                  aria-label="Stop"
                >
                  <span className="size-2.5 rounded-[2px] bg-black" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!canSend}
                  className={`mb-0.5 grid size-8 place-items-center rounded-full ${
                    canSend ? "bg-white text-black" : "bg-white/10 text-white/30"
                  }`}
                  aria-label="Send"
                >
                  <Icon name="arrow" className="size-4" />
                </button>
              )}
            </div>
            <div className="mt-2 flex items-start justify-between gap-4 px-2">
              <p className="text-[11px] leading-4 text-faint">
                Answers use your recipe library and a local model. Please double-check them.
              </p>
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setModelOpen((open) => !open)}
                  className="flex items-center gap-1 text-[12px] text-muted hover:text-foreground"
                >
                  llama3.1 8B
                  <Icon name="chevron" className="size-3" />
                </button>
                {modelOpen && (
                  <>
                    <button
                      type="button"
                      className="fixed inset-0 z-10 cursor-default"
                      aria-label="Close model details"
                      onClick={() => setModelOpen(false)}
                    />
                    <div className="absolute right-0 bottom-7 z-20 w-64 rounded-xl border border-line bg-elevated p-3 text-left shadow-xl">
                      <div className="text-[13px] font-medium">llama3.1 8B</div>
                      <p className="mt-1 text-[12px] leading-5 text-muted">
                        Running locally. Tokens stream from FastAPI on port 8000.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}

function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+?\*\*)/g);
  return parts.map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

function titleFrom(question: string) {
  const clean = question.replace(/\s+/g, " ").trim();
  if (clean.length <= 42) return clean;
  const cut = clean.slice(0, 42).replace(/\s+\S*$/, "");
  return cut || clean.slice(0, 42);
}

function TypingDots() {
  return (
    <span className="inline-flex h-6 items-center gap-1" aria-label="Generating">
      <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:0ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:150ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:300ms]" />
    </span>
  );
}

function Icon({ name, className = "size-[18px]" }: { name: string; className?: string }) {
  const props = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
  switch (name) {
    case "plus":
      return (
        <svg {...props}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "search":
      return (
        <svg {...props}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16.5 20 20.5" />
        </svg>
      );
    case "panel":
      return (
        <svg {...props}>
          <rect x="3.5" y="4" width="17" height="16" rx="2" />
          <path d="M9 4v16" />
        </svg>
      );
    case "chat":
      return (
        <svg {...props}>
          <path d="M6 17.5 4 20v-12a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6z" />
        </svg>
      );
    case "more":
      return (
        <svg {...props}>
          <path d="M6 12h.01M12 12h.01M18 12h.01" strokeWidth={2.4} />
        </svg>
      );
    case "chevron":
      return (
        <svg {...props}>
          <path d="m7 10 5 5 5-5" />
        </svg>
      );
    case "share":
      return (
        <svg {...props}>
          <path d="M14 5h5v5" />
          <path d="M19 5 10 14" />
          <path d="M10 6H6.5A1.5 1.5 0 0 0 5 7.5v10A1.5 1.5 0 0 0 6.5 19h10a1.5 1.5 0 0 0 1.5-1.5V14" />
        </svg>
      );
    case "arrow":
      return (
        <svg {...props} strokeWidth={2}>
          <path d="M12 18V6M7 11l5-5 5 5" />
        </svg>
      );
    case "user":
      return (
        <svg {...props} strokeWidth={2}>
          <circle cx="12" cy="7.5" r="3.5" />
          <path d="M19.6 19.8a7.7 7.7 0 0 0-15.2 0" />
        </svg>
      );
    default:
      return null;
  }
}
