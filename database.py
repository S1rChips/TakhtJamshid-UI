"""
TakhtJamshid - Database layer (SQLite only).
Pure stdlib sqlite3, no ORM, thread-safe via per-call connections.
"""
import sqlite3
import os
import json
import time
import uuid
import secrets
from werkzeug.security import generate_password_hash, check_password_hash

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "takhtjamshid.db")


def _conn():
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def init_db():
    conn = _conn()
    c = conn.cursor()

    c.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS nodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        address TEXT NOT NULL,
        api_port INTEGER DEFAULT 0,
        status TEXT DEFAULT 'offline',
        created_at INTEGER NOT NULL
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS inbounds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node_id INTEGER,
        remark TEXT NOT NULL,
        enable INTEGER DEFAULT 1,
        protocol TEXT NOT NULL,
        listen TEXT DEFAULT '',
        port INTEGER NOT NULL,
        network TEXT DEFAULT 'tcp',
        security TEXT DEFAULT 'none',
        settings TEXT DEFAULT '{}',
        stream_settings TEXT DEFAULT '{}',
        sniffing TEXT DEFAULT '{}',
        up INTEGER DEFAULT 0,
        down INTEGER DEFAULT 0,
        total INTEGER DEFAULT 0,
        expiry_time INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(node_id) REFERENCES nodes(id) ON DELETE SET NULL
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        inbound_id INTEGER NOT NULL,
        email TEXT NOT NULL,
        uuid TEXT NOT NULL,
        password TEXT DEFAULT '',
        flow TEXT DEFAULT '',
        enable INTEGER DEFAULT 1,
        total_gb INTEGER DEFAULT 0,
        expiry_time INTEGER DEFAULT 0,
        limit_ip INTEGER DEFAULT 0,
        up INTEGER DEFAULT 0,
        down INTEGER DEFAULT 0,
        sub_id TEXT DEFAULT '',
        tg_id TEXT DEFAULT '',
        online INTEGER DEFAULT 0,
        last_seen INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(inbound_id) REFERENCES inbounds(id) ON DELETE CASCADE
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS outbounds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tag TEXT NOT NULL,
        protocol TEXT NOT NULL,
        address TEXT DEFAULT '',
        port INTEGER DEFAULT 0,
        settings TEXT DEFAULT '{}',
        stream_settings TEXT DEFAULT '{}',
        send_through TEXT DEFAULT '',
        enable INTEGER DEFAULT 1,
        up INTEGER DEFAULT 0,
        down INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS routing_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        source TEXT DEFAULT '',
        domain TEXT DEFAULT '',
        ip TEXT DEFAULT '',
        port TEXT DEFAULT '',
        outbound_tag TEXT NOT NULL,
        enable INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT DEFAULT 'info',
        message TEXT NOT NULL,
        created_at INTEGER NOT NULL
    )""")

    conn.commit()

    # default admin
    c.execute("SELECT COUNT(*) AS n FROM users")
    if c.fetchone()["n"] == 0:
        c.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?,?,?)",
            ("admin", generate_password_hash("admin"), int(time.time())),
        )
    # default settings
    defaults = {
        "panel_title": "TakhtJamshid",
        "theme": "dark",
        "accent": "#7c3aed",
        "lang": "fa",
        "sub_port": "2096",
        "sub_path": "/sub/",
        "tg_token": "",
        "tg_chat": "",
        "xray_status": "running",
        "xray_version": "1.8.23",
    }
    for k, v in defaults.items():
        c.execute("INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)", (k, v))

    conn.commit()
    conn.close()


# ---------- generic helpers ----------
def query(sql, args=(), one=False):
    conn = _conn()
    cur = conn.execute(sql, args)
    rows = cur.fetchall()
    conn.close()
    rows = [dict(r) for r in rows]
    return (rows[0] if rows else None) if one else rows


def execute(sql, args=()):
    conn = _conn()
    cur = conn.execute(sql, args)
    conn.commit()
    lastid = cur.lastrowid
    conn.close()
    return lastid


# ---------- settings ----------
def get_settings():
    rows = query("SELECT key, value FROM settings")
    return {r["key"]: r["value"] for r in rows}


def set_setting(key, value):
    execute("INSERT INTO settings(key,value) VALUES(?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, str(value)))


# ---------- auth ----------
def verify_user(username, password):
    u = query("SELECT * FROM users WHERE username=?", (username,), one=True)
    if u and check_password_hash(u["password_hash"], password):
        return u
    return None


def change_credentials(uid, username, password):
    if password:
        execute("UPDATE users SET username=?, password_hash=? WHERE id=?",
                (username, generate_password_hash(password), uid))
    else:
        execute("UPDATE users SET username=? WHERE id=?", (username, uid))


def log(message, level="info"):
    execute("INSERT INTO logs(level,message,created_at) VALUES(?,?,?)",
            (level, message, int(time.time())))


def new_uuid():
    return str(uuid.uuid4())


def new_subid():
    return secrets.token_hex(8)
