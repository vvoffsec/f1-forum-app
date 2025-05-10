// server.js
const { createServer } = require("http");
const next = require("next");
const { Server } = require("socket.io");
const Database = require("better-sqlite3");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
const port = parseInt(process.env.PORT, 10) || 3000;

// Initialize SQLite DB 
const db = new Database("chat.db");
db.prepare(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gpId TEXT NOT NULL,
    author TEXT NOT NULL,
    text TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );
`).run();

app.prepare().then(() => {
  const server = createServer((req, res) => handle(req, res));
  const io = new Server(server, {
    path: "/socket.io",
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
    // Normalize gpId from query
    const raw = socket.handshake.query.gpId;
    const gpId = Array.isArray(raw) ? raw[0] : raw;
    if (typeof gpId !== "string") {
      socket.disconnect(true);
      return;
    }

    // Send chat history from SQLite
    const history = db
      .prepare(
        "SELECT author, text, createdAt FROM messages WHERE gpId = ? ORDER BY id"
      )
      .all(gpId);
    socket.emit("chat history", history);

    // Join the gp‑specific room
    socket.join(`gp-${gpId}`);

    // 2️On new message: insert into DB & broadcast
    socket.on("chat message", (msg) => {
      db.prepare(
        "INSERT INTO messages (gpId, author, text, createdAt) VALUES (?, ?, ?, ?)"
      ).run(msg.gpId, msg.author, msg.text, msg.createdAt);

      io.to(`gp-${msg.gpId}`).emit("chat message", msg);
    });
  });

  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Listening on http://localhost:${port}`);
  });
});
