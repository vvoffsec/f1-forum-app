"use client";

import {
  SignInButton,
  SignOutButton,
  SignedIn,
  SignedOut,
  useClerk,
  useUser,
} from "@clerk/nextjs";
import { Realtime } from "ably";
import { Filter } from "bad-words";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ChangeEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { v4 as uuidv4 } from "uuid";

type Msg = {
  messageId: string;
  author: string;
  text: string;
  createdAt: string;
};

type Reaction = {
  messageId: string;
  emoji: string;
  user: string;
  createdAt: string;
};

type Thread = {
  id: string;
  title: string;
};

export default function ChatPage() {
  const params = useParams();
  const raw = params.gpId;
  const gpId = Array.isArray(raw) ? raw[0] : raw;
  if (!gpId) return <div className="p-8">Invalid GP ID</div>;

  const { isLoaded, user } = useUser();
  const { openSignIn, openUserProfile } = useClerk();
  const [menuOpen, setMenuOpen] = useState(false);
  const [raceName, setRaceName] = useState(`GP ${gpId}`);

  if (!isLoaded) return null;
  const username = user?.username || user?.firstName || "Anon";

  useEffect(() => {
    fetch("/api/threads?limit=100")
      .then((res) => res.json() as Promise<Thread[]>)
      .then((threads) => {
        const t = threads.find((t) => t.id === gpId);
        if (t) {
          const parts = t.title.split("--").map((s) => s.trim());
          setRaceName(parts[1] || t.title);
        }
      })
      .catch(console.error);
  }, [gpId]);

  return (
    <div className="flex flex-col h-screen bg-f1-charcoal text-f1-white">
      <header className="flex items-center justify-between px-6 py-4 bg-f1-card flex-shrink-0">
        <div className="flex items-center space-x-4">
          <Link href="/" className="text-f1-red hover:text-red-400 font-medium">
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
              className="flex items-center text-f1-red hover:text-red-400"
            >
              Hi, {username}
              <svg
                className={`w-4 h-4 ml-1 transform transition ${menuOpen ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
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
  const MAX_CHAR_LIMIT = 1000;
  const RATE_LIMIT_COUNT = 10;
  const RATE_LIMIT_WINDOW_MS = 60 * 1000;
  const filter = new Filter();

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [input, setInput] = useState("");
  const [timestamps, setTimestamps] = useState<number[]>([]);
  const [alert, setAlert] = useState<{ id: number; text: string } | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const ablyRef = useRef<Realtime | null>(null);
  const chRef = useRef<ReturnType<Realtime["channels"]["get"]> | null>(null);

  const showAlert = (text: string) => {
    const id = Date.now();
    setAlert({ id, text });
    setTimeout(() => {
      setAlert((cur) => (cur?.id === id ? null : cur));
    }, 5000);
  };

  useEffect(() => {
    ablyRef.current = new Realtime({
      key: process.env.NEXT_PUBLIC_ABLY_API_KEY!,
      clientId: username,
    });
    chRef.current = ablyRef.current.channels.get(`chat-${gpId}`);

    chRef.current
      .history({ limit: 100 })
      .then((page) => {
        const histMsgs: Msg[] = [];
        const histReacts: Reaction[] = [];
        page.items.forEach((item) => {
          if (item.name === "message") {
            histMsgs.push(item.data as Msg);
          } else if (item.name === "reaction") {
            histReacts.push(item.data as Reaction);
          } else if (item.name === "unreaction") {
            const u = item.data as Reaction;
            const idx = histReacts.findIndex(
              (r) =>
                r.messageId === u.messageId &&
                r.emoji === u.emoji &&
                r.user === u.user
            );
            if (idx !== -1) histReacts.splice(idx, 1);
          }
        });
        setMsgs(histMsgs.reverse());
        setReactions(histReacts);
      })
      .catch(console.error);

    chRef.current.subscribe("message", (m) =>
      setMsgs((ms) => [...ms, m.data as Msg])
    );
    chRef.current.subscribe("reaction", (m) =>
      setReactions((rs) => [...rs, m.data as Reaction])
    );
    chRef.current.subscribe("unreaction", (m) =>
      setReactions((rs) =>
        rs.filter(
          (r) =>
            !(
              r.messageId === (m.data as Reaction).messageId &&
              r.emoji === (m.data as Reaction).emoji &&
              r.user === (m.data as Reaction).user
            )
        )
      )
    );

    return () => {
      chRef.current?.unsubscribe();
      ablyRef.current?.close();
    };
  }, [gpId, username]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, reactions]);

  const send = () => {
    const text = input.trim();
    const now = Date.now();
    const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

    if (recent.length >= RATE_LIMIT_COUNT) {
      showAlert("You’re sending messages too quickly.");
      return;
    }
    if (!text) return;
    if (text.length > MAX_CHAR_LIMIT) {
      showAlert(`Only ${MAX_CHAR_LIMIT} characters allowed.`);
      return;
    }
    if (filter.isProfane(text)) {
      showAlert("Please remove any profanity.");
      return;
    }

    const message: Msg = {
      messageId: uuidv4(),
      author: username,
      text,
      createdAt: new Date().toISOString(),
    };
    chRef.current?.publish("message", message);
    setInput("");
    setTimestamps([...recent, now]);
  };

  const react = (messageId: string, emoji: string) => {
    const already = reactions.some(
      (r) => r.messageId === messageId && r.emoji === emoji && r.user === username
    );
    const event: Reaction = {
      messageId,
      emoji,
      user: username,
      createdAt: new Date().toISOString(),
    };
    chRef.current?.publish(already ? "unreaction" : "reaction", event);
  };

  return (
    <div className="flex-1 flex flex-col">
      <AnimatePresence>
        {alert && (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="fixed top-16 left-1/2 transform -translate-x-1/2 bg-f1-red bg-opacity-90 text-white px-4 py-2 rounded shadow-md z-50"
          >
            <div className="text-sm">{alert.text}</div>
            <motion.div
              initial={{ width: "100%" }}
              animate={{ width: "0%" }}
              transition={{ duration: 5, ease: "linear" }}
              className="h-1 bg-white mt-1 rounded"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 overflow-auto px-6 py-4 space-y-4">
        {msgs.map((m) => (
          <MessageBubble
            key={m.messageId}
            msg={m}
            username={username}
            reactions={reactions}
            onReact={react}
          />
        ))}
        <div ref={bottomRef} />
      </main>

      <footer className="flex items-center px-6 py-3 bg-f1-card flex-shrink-0">
        <input
          type="text"
          className="flex-1 mr-2 px-4 py-2 rounded-full bg-gray-800 placeholder-gray-400 focus:outline-none"
          placeholder="Type a message…"
          value={input}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            if (e.target.value.length <= MAX_CHAR_LIMIT) {
              setInput(e.target.value);
            }
          }}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && send()}
        />
        <span className="text-sm text-gray-400 mr-4">
          {input.length}/{MAX_CHAR_LIMIT}
        </span>
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
  reactions,
  onReact,
}: {
  msg: Msg;
  username: string;
  reactions: Reaction[];
  onReact: (messageId: string, emoji: string) => void;
}) {
  const isMe = msg.author === username;
  const [timeStr, setTimeStr] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setTimeStr(
      new Date(msg.createdAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  }, [msg.createdAt]);

  const counts = reactions
    .filter((r) => r.messageId === msg.messageId)
    .reduce((acc, r) => {
      acc[r.emoji] = (acc[r.emoji] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  return (
    <div
      className={`relative group max-w-[75%] mx-2 ${
        isMe ? "ml-auto" : "mr-auto"
      }`}
    >
      <div
        className={`relative p-3 rounded-xl break-words ${
          isMe ? "bg-f1-red text-white" : "bg-gray-700 text-gray-100"
        }`}
      >
        <div className="flex items-baseline justify-between">
          <span className="font-medium">{msg.author}</span>
          <span className="ml-2 text-xs text-gray-400">{timeStr}</span>
        </div>
        <p className="mt-1 break-all">{msg.text}</p>

        <div className="absolute bottom-1 right-2 flex items-center space-x-2 bg-black bg-opacity-50 rounded-full px-2 py-0.5 text-xs">
          <AnimatePresence initial={false}>
            {Object.entries(counts).map(([emoji, count]) => (
              <motion.div
                key={emoji}
                className="flex items-center space-x-1"
                layout
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <span>{emoji}</span>
                <motion.span
                  key={count}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                >
                  {count}
                </motion.span>
              </motion.div>
            ))}
          </AnimatePresence>
          <motion.button
            onClick={() => setMenuOpen((o) => !o)}
            className="px-1 hover:bg-gray-600 rounded"
            whileTap={{ scale: 0.9 }}
          >
            +
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-8 right-0 bg-f1-card p-2 rounded shadow-md z-10 flex space-x-2"
          >
            {["👍", "👎", "❤️"].map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  onReact(msg.messageId, emoji);
                  setMenuOpen(false);
                }}
                className="p-1 hover:bg-gray-600 rounded"
              >
                {emoji}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
