const fs = require('fs');
const path = require('path');

let db;
const useLocal = false; // Set true jika mau pakai SQLite lokal, false untuk Turso cloud

if (useLocal) {
  console.log('📁 Menggunakan SQLite lokal...');
  const Database = require('better-sqlite3');
  const dbPath = path.join(__dirname, 'jadwal.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  
  db.execute = function(opts) {
    const sql = opts.sql.trim().toUpperCase();
    if (sql.startsWith('SELECT')) {
      const result = this.prepare(opts.sql).all(...(opts.args || []));
      return { rows: result };
    } else {
      const info = this.prepare(opts.sql).run(...(opts.args || []));
      return { rows: [], lastInsertRowid: info.lastInsertRowid };
    }
  };
  
  db.executeMultiple = function(sql) {
    this.exec(sql);
  };
} else {
  console.log('🌐 Menggunakan Turso cloud...');
  const { createClient } = require('@libsql/client');
  db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
  });
}

async function initDb() {
  await db.executeMultiple(`
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
      text_content TEXT,
      uploaded_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
}

module.exports = { db, initDb };
