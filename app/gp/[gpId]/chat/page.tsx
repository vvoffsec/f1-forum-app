// app/gp/[gpId]/chat/page.tsx
"use client";

import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignOutButton,
  useClerk,
  useUser,
} from "@clerk/nextjs";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import * as Ably from "ably";

type Msg = {
  author: string;
  text: string;
  createdAt: string;
};
type Thread = { id: string; title: string };

export default function ChatPage() {
  const params = useParams();
  const raw = params.gpId;
  const gpId = Array.isArray(raw) ? raw[0] : raw;
  if (!gpId) return <div className="p-8">Invalid GP ID</div>;

  const { isLoaded, user } = useUser();
  const { openSignIn, openUserProfile } = useClerk();
  const [menuOpen, setMenuOpen] = useState(false);
  const [raceName, setRaceName] = useState("GP " + gpId);

  // fetch real race title
  useEffect(() => {
    fetch("/api/threads?limit=100")
      .then((res) => res.json() as Promise<Thread[]>)
      .then((threads) => {
        const t = threads.find((t) => t.id === gpId);
        if (t) {
          const parts = t.title.split("--").map((s) => s.trim());
          setRaceName(parts[1] ?? t.title);
        }
      })
      .catch(() => {});
  }, [gpId]);

  if (!isLoaded) return null;
  const username = user?.username ?? user?.firstName ?? "";

  return (
    <div className="flex flex-col h-screen bg-f1-charcoal text-f1-white">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-f1-card">
        <div className="flex items-center space-x-4">
          <Link
            href="/"
            className="text-f1-red hover:text-red-400 transition font-medium"
          >
            ← Home
          </Link>
          <h1 className="text-xl font-semibold">{raceName} Chat</h1>
        </div>
        <div className="relative">
          <SignedOut>
            <SignInButton>
              <button className="text-f1-red hover:text-red-400">Sign In</button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center text-f1-red hover:text-red-400 transition"
            >
              Hi, {username || "there"}!
              <svg
                className={`w-4 h-4 ml-1 transform transition ${
                  menuOpen ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                viewBox="0 0 24 24"
              >
                <path d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-40 bg-f1-card rounded-lg shadow-md z-10">
                <button
                  onClick={() => {
                    openUserProfile();
                    setMenuOpen(false);
                  }}
                  className="block w-full text-left px-4 py-2 text-sm text-f1-red hover:text-red-400"
                >
                  Account
                </button>
                <SignOutButton>
                  <button
                    onClick={() => setMenuOpen(false)}
                    className="block w-full text-left px-4 py-2 text-sm text-f1-red hover:text-red-400"
                  >
                    Sign Out
                  </button>
                </SignOutButton>
              </div>
            )}
          </SignedIn>
        </div>
      </header>

      <SignedIn>
        <ChatWindow gpId={gpId} username={username} />
      </SignedIn>
    </div>
  );
}

function ChatWindow({
  gpId,
  username,
}: {
  gpId: string;
  username: string;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const ablyRef = useRef<Ably.Realtime | null>(null);
  const chRef = useRef<ReturnType<Ably.Realtime["channels"]["get"]> | null>(
    null
  );

  useEffect(() => {
    // initialize Ably
    ablyRef.current = new Ably.Realtime({
      key: process.env.NEXT_PUBLIC_ABLY_API_KEY!,
      clientId: username,
    });
    chRef.current = ablyRef.current.channels.get(`chat-${gpId}`);

    // load last 100, then reverse so oldest → newest
    chRef.current
      .history({ limit: 100 })
      .then((page) => {
        const items = (page.items || []).map((i) => i.data as Msg);
        setMsgs(items.reverse());
      })
      .catch((err) => console.error("Ably history error", err));

    // subscribe live
    chRef.current.subscribe((msg) => {
      setMsgs((prev) => [...prev, msg.data as Msg]);
    });

    return () => {
      chRef.current?.unsubscribe();
      // don’t close() here to avoid runtime errors
    };
  }, [gpId, username]);

  // auto scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const send = () => {
    if (!input.trim()) return;
    const m: Msg = {
      author: username,
      text: input.trim(),
      createdAt: new Date().toISOString(),
    };
    chRef.current?.publish("message", m).catch((e) => console.error(e));
    setInput("");
  };

  return (
    <div className="flex-1 flex flex-col">
      <main className="flex-1 overflow-auto px-6 py-4 space-y-4">
        {msgs.map((m, i) => (
          <MessageBubble key={i} msg={m} username={username} />
        ))}
        <div ref={bottomRef} />
      </main>

      <footer className="flex items-center px-4 py-3 bg-f1-card">
        <input
          type="text"
          className="flex-1 mr-2 px-4 py-2 rounded-full bg-gray-800 placeholder-gray-400 focus:outline-none"
          placeholder="Type a message…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button
          onClick={send}
          disabled={!input.trim()}
          className="px-4 py-2 rounded-full bg-f1-red hover:bg-red-600 disabled:opacity-50"
        >
          Send
        </button>
      </footer>
    </div>
  );
}

function MessageBubble({
  msg,
  username,
}: {
  msg: Msg;
  username: string;
}) {
  const [timeStr, setTimeStr] = useState("");
  const isMe = msg.author === username;

  // defer the timestamp until after hydration
  useEffect(() => {
    setTimeStr(
      new Date(msg.createdAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  }, [msg.createdAt]);

  return (
    <div
      className={`max-w-[75%] p-3 rounded-xl break-words ${
        isMe ? "ml-auto bg-f1-red text-white" : "mr-auto bg-gray-700 text-gray-100"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <span className="font-medium">{msg.author}</span>
        <span className="ml-2 text-xs text-gray-400">{timeStr}</span>
      </div>
      <p className="mt-1 break-all">{msg.text}</p>
    </div>
  );
}