const path = require("path");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "arcade_lab_dev_secret_change_me";
const PUBLIC_DIR = path.join(__dirname, "public");
const DB_PATH = path.join(__dirname, "data", "arcade.db");

const db = new sqlite3.Database(DB_PATH);

function addColumnIfMissing(table, column, definition) {
  db.all(`PRAGMA table_info(${table})`, (err, rows) => {
    if (err || !rows) return;
    const exists = rows.some((r) => r.name === column);
    if (!exists) {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  });
}

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      avatar_url TEXT DEFAULT '',
      bio TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  addColumnIfMissing("users", "avatar_url", "TEXT DEFAULT ''");
  addColumnIfMissing("users", "bio", "TEXT DEFAULT ''");
});

app.use(express.json());
app.use(express.static(PUBLIC_DIR));

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, username: user.username },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function authRequired(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  if (!token) {
    return res.status(401).json({ error: "Missing token" });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

app.get("/", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "opening.html"));
});

app.post("/api/auth/register", (req, res) => {
  const { username, email, password } = req.body || {};
  const cleanUsername = String(username || "").trim();
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanPassword = String(password || "");

  if (cleanUsername.length < 3 || cleanUsername.length > 24) {
    return res.status(400).json({ error: "Username must be 3-24 characters" });
  }
  if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
    return res.status(400).json({ error: "Invalid email" });
  }
  if (cleanPassword.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  const passwordHash = bcrypt.hashSync(cleanPassword, 10);

  db.run(
    "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
    [cleanUsername, cleanEmail, passwordHash],
    function onInsert(err) {
      if (err) {
        if (String(err.message || "").includes("UNIQUE")) {
          return res.status(409).json({ error: "Email already registered" });
        }
        return res.status(500).json({ error: "Failed to register" });
      }

      const user = { id: this.lastID, username: cleanUsername, email: cleanEmail };
      const token = signToken(user);
      return res.json({ token, user });
    }
  );
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanPassword = String(password || "");

  db.get(
    "SELECT id, username, email, password_hash FROM users WHERE email = ?",
    [cleanEmail],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: "Failed to login" });
      }
      if (!row || !bcrypt.compareSync(cleanPassword, row.password_hash)) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const user = { id: row.id, username: row.username, email: row.email };
      const token = signToken(user);
      return res.json({ token, user });
    }
  );
});

app.get("/api/auth/me", authRequired, (req, res) => {
  db.get(
    "SELECT id, username, email, avatar_url, bio, created_at FROM users WHERE id = ?",
    [req.user.id],
    (err, row) => {
      if (err || !row) {
        return res.status(401).json({ error: "User not found" });
      }
      return res.json({ user: row });
    }
  );
});

app.get("/api/profile", authRequired, (req, res) => {
  db.get(
    "SELECT id, username, email, avatar_url, bio, created_at FROM users WHERE id = ?",
    [req.user.id],
    (err, row) => {
      if (err || !row) {
        return res.status(404).json({ error: "Profile not found" });
      }
      return res.json({ profile: row });
    }
  );
});

app.put("/api/profile", authRequired, (req, res) => {
  const {
    username,
    email,
    avatar_url,
    bio,
    current_password,
    new_password
  } = req.body || {};

  const cleanUsername = String(username || "").trim();
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanAvatar = String(avatar_url || "").trim();
  const cleanBio = String(bio || "").trim();
  const currentPassword = String(current_password || "");
  const newPassword = String(new_password || "");

  if (cleanUsername.length < 3 || cleanUsername.length > 24) {
    return res.status(400).json({ error: "Username must be 3-24 characters" });
  }
  if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
    return res.status(400).json({ error: "Invalid email" });
  }
  if (cleanBio.length > 180) {
    return res.status(400).json({ error: "Bio must be 180 characters or less" });
  }
  if (cleanAvatar && !/^https?:\/\//i.test(cleanAvatar)) {
    return res.status(400).json({ error: "Avatar URL must start with http or https" });
  }

  db.get(
    "SELECT id, password_hash FROM users WHERE id = ?",
    [req.user.id],
    (err, userRow) => {
      if (err || !userRow) {
        return res.status(404).json({ error: "User not found" });
      }

      const updateFields = [cleanUsername, cleanEmail, cleanAvatar, cleanBio];
      let query = "UPDATE users SET username = ?, email = ?, avatar_url = ?, bio = ?";

      if (newPassword.length > 0) {
        if (newPassword.length < 6) {
          return res.status(400).json({ error: "New password must be at least 6 characters" });
        }
        if (!currentPassword || !bcrypt.compareSync(currentPassword, userRow.password_hash)) {
          return res.status(401).json({ error: "Current password is incorrect" });
        }

        const newHash = bcrypt.hashSync(newPassword, 10);
        query += ", password_hash = ?";
        updateFields.push(newHash);
      }

      query += " WHERE id = ?";
      updateFields.push(req.user.id);

      db.run(query, updateFields, (updateErr) => {
        if (updateErr) {
          if (String(updateErr.message || "").includes("UNIQUE")) {
            return res.status(409).json({ error: "Email already in use" });
          }
          return res.status(500).json({ error: "Failed to update profile" });
        }

        db.get(
          "SELECT id, username, email, avatar_url, bio, created_at FROM users WHERE id = ?",
          [req.user.id],
          (readErr, updated) => {
            if (readErr || !updated) {
              return res.status(500).json({ error: "Failed to load updated profile" });
            }

            const token = signToken({
              id: updated.id,
              username: updated.username,
              email: updated.email
            });

            return res.json({ profile: updated, token });
          }
        );
      });
    }
  );
});

app.listen(PORT, () => {
  console.log(`Arcade Lab server running at http://localhost:${PORT}`);
});
