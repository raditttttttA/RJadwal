const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    time TEXT NOT NULL,
    end_time TEXT,
    note TEXT,
    tipe TEXT NOT NULL,
    days TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS materi (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    subject_key TEXT NOT NULL,
    subject_name TEXT NOT NULL,
    type TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT,
    file_path TEXT,
    url TEXT,
    uploaded_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

module.exports = db;
