"use client";

import {
  SignedIn,
  SignedOut,
  SignOutButton,
  useClerk,
  useUser,
  useAuth,
} from "@clerk/nextjs";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import { z } from "zod";

const MAX_MESSAGE_LENGTH = 2000;
const gpIdSchema = z.string().regex(/^[\w-]+$/, "Invalid GP ID format");

type Msg = {
  gpId?: string;
  author: string;
  text: string;
  createdAt: string;
};
type Thread = { id: string; title: string };

export default function ChatPage() {
  const params = useParams();
  const raw = params.gpId;
  const gpIdCandidate = Array.isArray(raw) ? raw[0] : raw;
  const parsed = gpIdSchema.safeParse(gpIdCandidate);
  if (!parsed.success) {
    return <div className="p-8 text-red-400">Invalid GP ID</div>;
  }
  const gpId = parsed.data;

  const { isLoaded, user } = useUser();
  const { getToken } = useAuth();
  const { openSignIn, openUserProfile } = useClerk();

  if (!isLoaded) return null;

  const displayName = user?.username ?? "Anon";
  const [raceName, setRaceName] = useState("GP " + gpId);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Fetch race title
  useEffect(() => {
    fetch("/api/threads?limit=100")
      .then((res) => {
        if (!res.ok) throw new Error("Network error");
        return res.json() as Promise<Thread[]>;
      })
      .then((threads) => {
        const t = threads.find((t) => t.id === gpId);
        if (t) {
          const parts = t.title.split("--").map((s) => s.trim());
          setRaceName(parts[1] ?? t.title);
        }
      })
      .catch(() => {});
  }, [gpId]);

  // Socket.io connection effect
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const token = await getToken();
      if (cancelled) return;

      // Tear down any existing socket
      socketRef.current?.disconnect();

      // Create new socket
      const socket = io(undefined, {
        path: "/socket.io",
        transports: ["websocket"],
        secure: true,
        auth: { token },
        query: { gpId },
      });

      // Defensive: clear any old listeners
      socket.removeAllListeners();

      // Register handlers
      socket.on("chat history", (history: Msg[]) => {
        setMsgs(history);
      });

      socket.on("chat message", (m: Msg) => {
        if (typeof m.text === "string" && typeof m.author === "string") {
          setMsgs((ms) => [...ms, m]);
        }
      });

      socketRef.current = socket;
    })();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [gpId, getToken]);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  // Send a message
  const send = () => {
    const trimmed = input.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!trimmed || !isLoaded) return;

    const m: Msg = {
      gpId,
      author: displayName,
      text: trimmed,
      createdAt: new Date().toISOString(),
    };

    socketRef.current?.emit("chat message", m);
    setInput("");
  };

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
            <button
              onClick={() => openSignIn()}
              className="text-f1-red hover:text-red-400 transition"
            >
              Sign In
            </button>
          </SignedOut>
          <SignedIn>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="text-f1-red hover:text-red-400 transition flex items-center"
            >
              Hi, {user?.firstName || "there"}!
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
                  className="block w-full text-left px-4 py-2 text-sm text-f1-red hover:text-red-400 transition"
                >
                  Account
                </button>
                <SignOutButton>
                  <button
                    onClick={() => setMenuOpen(false)}
                    className="block w-full text-left px-4 py-2 text-sm text-f1-red hover:text-red-400 transition"
                  >
                    Sign Out
                  </button>
                </SignOutButton>
              </div>
            )}
          </SignedIn>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-auto px-6 py-4 space-y-4">
        {msgs.map((m, i) => {
          const isMe = m.author === displayName;
          return (
            <div
              key={i}
              className={`max-w-[75%] p-3 rounded-xl ${
                isMe
                  ? "ml-auto bg-f1-red text-white"
                  : "mr-auto bg-gray-700 text-gray-100"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span className="font-medium">{m.author}</span>
                <span className="ml-2 text-xs text-gray-400">
                  {new Date(m.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="mt-1 break-words whitespace-pre-wrap">
                {m.text}
              </p>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </main>

      {/* Input bar */}
      <footer className="flex items-center px-4 py-3 bg-f1-card">
        <input
          type="text"
          maxLength={MAX_MESSAGE_LENGTH}
          className="flex-1 mr-2 px-4 py-2 rounded-full bg-gray-800 placeholder-gray-400 focus:outline-none"
          placeholder="Type a message…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          disabled={!isLoaded}
        />
        <span className="text-sm text-gray-400 mr-2">
          {input.length}/{MAX_MESSAGE_LENGTH}
        </span>
        <button
          onClick={send}
          disabled={!input.trim() || !isLoaded}
          className="px-4 py-2 rounded-full bg-f1-red hover:bg-red-600 disabled:opacity-50"
        >
          Send
        </button>
      </footer>
    </div>
  );
}