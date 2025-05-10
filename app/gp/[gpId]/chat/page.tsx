"use client";

import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignOutButton,
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

type Thread = {
  id: string;
  title: string;
};

export default function ChatPage() {
  const params = useParams();
  const gpId = Array.isArray(params.gpId) ? params.gpId[0] : params.gpId;
  if (!gpId) return <div className="p-8">Invalid GP ID</div>;

  const { isLoaded, user } = useUser();
  if (!isLoaded || !user) return null;

  // Ensure username is a string
  const username = user.username ?? user.firstName ?? user.id;

  // Race name state and fetch
  const [raceName, setRaceName] = useState(`GP ${gpId}`);
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
        <div>
          <SignedOut>
            <SignInButton>
              <button className="text-f1-red hover:text-red-400">Sign In</button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <div className="flex items-center space-x-4">
              <span>Hi, {username}!</span>
              <SignOutButton>
                <button className="text-f1-red hover:text-red-400">Sign Out</button>
              </SignOutButton>
            </div>
          </SignedIn>
        </div>
      </header>

      <SignedIn>
        <ChatWindow gpId={gpId} username={username} />
      </SignedIn>
      <SignedOut>
        <div className="flex-1 p-8">
          <p>Please sign in to join the chat.</p>
        </div>
      </SignedOut>
    </div>
  );
}

function ChatWindow({ gpId, username }: { gpId: string; username: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Ably and channel refs
  const ablyRef = useRef<Ably.Realtime | null>(null);
  const channelRef = useRef<ReturnType<Ably.Realtime["channels"]["get"]> | null>(null);

  useEffect(() => {
    // Initialize Ably client
    ablyRef.current = new Ably.Realtime({
      key: process.env.NEXT_PUBLIC_ABLY_API_KEY!,
      clientId: username,
    });
    channelRef.current = ablyRef.current.channels.get(`chat-${gpId}`);

    // Load last 100 messages via promise API
    channelRef.current.history({ limit: 100 })
      .then((page) => {
        const history = (page.items || []).map((m) => m.data as Msg);
        setMsgs(history);
      })
      .catch((err) => {
        console.error("Ably history error:", err);
      });

    // Subscribe to new messages
    channelRef.current.subscribe((msg) => {
      setMsgs((prev) => [...prev, msg.data as Msg]);
    });

    // Cleanup: only unsubscribe channel
    return () => {
      channelRef.current?.unsubscribe();
    };
  }, [gpId, username]);

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
    channelRef.current?.publish("message", m)
      .catch((err) => console.error("Publish failed:", err));
    setInput("");
  };

  return (
    <>
      <main className="flex-1 overflow-auto px-6 py-4 space-y-4">
        {msgs.map((m, i) => {
          const isMe = m.author === username;
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
              <p className="mt-1">{m.text}</p>
            </div>
          );
        })}
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
    </>
  );
}