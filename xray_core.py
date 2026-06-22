"""
TakhtJamshid - real Xray-core process manager (original implementation).

Responsibilities:
  * locate (or auto-download) the Xray binary
  * generate a valid config.json from the database
  * start / stop / restart the real xray process (it actually listens on ports)
  * generate REALITY x25519 key pairs and short ids
  * poll live traffic stats via `xray api statsquery` and write them back to DB
  * enforce client quota / expiry
"""
import os
import sys
import json
import time
import zipfile
import secrets
import platform
import threading
import subprocess
import urllib.request

import database as db
import xray_config as xc

BASE = os.path.dirname(os.path.abspath(__file__))
BIN_DIR = os.path.join(BASE, "bin")
CONFIG_PATH = os.path.join(BIN_DIR, "config.json")
API_PORT = 62789

_proc = None
_lock = threading.Lock()
_poller_started = False


# ----------------------------------------------------------------- binary
def _exe_name():
    return "xray.exe" if os.name == "nt" else "xray"


def xray_path():
    p = os.path.join(BIN_DIR, _exe_name())
    return p if os.path.exists(p) else None


def _download_url():
    sysname = platform.system().lower()
    arch = platform.machine().lower()
    if sysname == "windows":
        asset = "Xray-windows-64.zip" if "64" in arch or arch == "amd64" else "Xray-windows-32.zip"
    elif sysname == "darwin":
        asset = "Xray-macos-arm64-v8a.zip" if "arm" in arch else "Xray-macos-64.zip"
    else:
        asset = "Xray-linux-arm64-v8a.zip" if "aarch64" in arch or "arm64" in arch else "Xray-linux-64.zip"
    return f"https://github.com/XTLS/Xray-core/releases/latest/download/{asset}"


def download_xray():
    """Download & extract the Xray binary + geo data into ./bin. Returns (ok, msg)."""
    os.makedirs(BIN_DIR, exist_ok=True)
    url = _download_url()
    zip_path = os.path.join(BIN_DIR, "xray.zip")
    try:
        db.log(f"Downloading Xray from {url}")
        req = urllib.request.Request(url, headers={"User-Agent": "TakhtJamshid"})
        with urllib.request.urlopen(req, timeout=120) as r, open(zip_path, "wb") as f:
            f.write(r.read())
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(BIN_DIR)
        os.remove(zip_path)
        if os.name != "nt":
            os.chmod(os.path.join(BIN_DIR, "xray"), 0o755)
        db.log("Xray downloaded successfully")
        return True, "downloaded"
    except Exception as e:
        db.log(f"Xray download failed: {e}", "error")
        return False, str(e)


def ensure_binary():
    if xray_path():
        return True, "present"
    return download_xray()


def version():
    p = xray_path()
    if not p:
        return "not-installed"
    try:
        out = subprocess.run([p, "version"], capture_output=True, text=True, timeout=10)
        first = (out.stdout or "").splitlines()
        return first[0] if first else "unknown"
    except Exception:
        return "unknown"


# ----------------------------------------------------------------- keys
def gen_x25519():
    """Generate a REALITY key pair using the xray binary; fallback to pure-python."""
    p = xray_path()
    if p:
        try:
            out = subprocess.run([p, "x25519"], capture_output=True, text=True, timeout=10)
            priv = pub = ""
            for line in out.stdout.splitlines():
                low = line.lower()
                if "private" in low:
                    priv = line.split(":", 1)[1].strip()
                elif "public" in low:
                    pub = line.split(":", 1)[1].strip()
            if priv and pub:
                return {"privateKey": priv, "publicKey": pub}
        except Exception:
            pass
    # fallback (requires cryptography); otherwise random placeholders
    try:
        import base64
        from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
        from cryptography.hazmat.primitives import serialization
        k = X25519PrivateKey.generate()
        raw_priv = k.private_bytes(serialization.Encoding.Raw,
                                   serialization.PrivateFormat.Raw,
                                   serialization.NoEncryption())
        raw_pub = k.public_key().public_bytes(serialization.Encoding.Raw,
                                               serialization.PublicFormat.Raw)
        b64 = lambda b: base64.urlsafe_b64encode(b).decode().rstrip("=")
        return {"privateKey": b64(raw_priv), "publicKey": b64(raw_pub)}
    except Exception:
        return {"privateKey": secrets.token_urlsafe(32)[:43],
                "publicKey": secrets.token_urlsafe(32)[:43]}


def gen_short_id(n=8):
    return secrets.token_hex(n)


# ----------------------------------------------------------------- config
def build_config():
    inbounds = db.query("SELECT * FROM inbounds WHERE enable=1")
    clients_by = {}
    now_ms = int(time.time() * 1000)
    for ib in inbounds:
        rows = db.query("SELECT * FROM clients WHERE inbound_id=? AND enable=1", (ib["id"],))
        active = []
        for c in rows:
            if c["expiry_time"] and c["expiry_time"] < now_ms:
                continue
            if c["total_gb"] and (c["up"] + c["down"]) >= c["total_gb"]:
                continue
            active.append(c)
        clients_by[ib["id"]] = active
    outbounds = db.query("SELECT * FROM outbounds WHERE enable=1")
    rules = db.query("SELECT * FROM routing_rules WHERE enable=1")
    return xc.assemble_config(inbounds, clients_by, outbounds, rules, api_port=API_PORT)


def write_config():
    os.makedirs(BIN_DIR, exist_ok=True)
    cfg = build_config()
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
    return cfg


def test_config():
    p = xray_path()
    if not p:
        return False, "binary not installed"
    write_config()
    try:
        out = subprocess.run([p, "run", "-test", "-c", CONFIG_PATH],
                             capture_output=True, text=True, timeout=20)
        ok = out.returncode == 0
        return ok, (out.stdout + out.stderr).strip()[-1500:]
    except Exception as e:
        return False, str(e)


# ----------------------------------------------------------------- process
def is_running():
    return _proc is not None and _proc.poll() is None


def start():
    global _proc
    with _lock:
        if is_running():
            return True, "already running"
        ok, msg = ensure_binary()
        if not ok:
            return False, f"binary unavailable: {msg}"
        write_config()
        p = xray_path()
        try:
            flags = 0
            if os.name == "nt":
                flags = subprocess.CREATE_NO_WINDOW
            _proc = subprocess.Popen([p, "run", "-c", CONFIG_PATH],
                                     cwd=BIN_DIR, stdout=subprocess.PIPE,
                                     stderr=subprocess.STDOUT, creationflags=flags)
        except Exception as e:
            return False, str(e)
        time.sleep(1.0)
        if _proc.poll() is not None:
            tail = ""
            try:
                tail = _proc.stdout.read().decode(errors="ignore")[-800:]
            except Exception:
                pass
            return False, f"xray exited immediately: {tail}"
        db.set_setting("xray_status", "running")
        db.log("Xray started")
        _start_poller()
        return True, "started"


def stop():
    global _proc
    with _lock:
        if _proc and _proc.poll() is None:
            try:
                _proc.terminate()
                _proc.wait(timeout=8)
            except Exception:
                try:
                    _proc.kill()
                except Exception:
                    pass
        _proc = None
        db.set_setting("xray_status", "stopped")
        db.log("Xray stopped")
        return True, "stopped"


def restart():
    stop()
    time.sleep(0.4)
    return start()


def status():
    return {
        "running": is_running(),
        "installed": xray_path() is not None,
        "version": version(),
        "api_port": API_PORT,
    }


# ----------------------------------------------------------------- stats
def _query_stats():
    p = xray_path()
    if not p:
        return {}
    try:
        out = subprocess.run([p, "api", "statsquery", f"--server=127.0.0.1:{API_PORT}"],
                             capture_output=True, text=True, timeout=10)
        data = json.loads(out.stdout or "{}")
    except Exception:
        return {}
    res = {}
    for item in data.get("stat", []) or []:
        res[item.get("name", "")] = int(item.get("value", 0) or 0)
    return res


def _delta(raw_now, raw_prev):
    """Counter delta that survives an Xray restart (counters reset to 0)."""
    d = raw_now - raw_prev
    return raw_now if d < 0 else d


def poll_once():
    """Pull live counters from xray and *accumulate* them into the DB.

    Xray's stat counters are cumulative since the process started and reset to
    zero on every restart, so we store the last raw reading (raw_up/raw_down)
    and only ever add the positive delta to the persisted totals. This keeps a
    user's consumed traffic intact across `xray restart`.
    """
    if not is_running():
        return
    stats = _query_stats()
    if not stats:
        return
    now = int(time.time())

    def collect(prefix):
        agg = {}
        for name, val in stats.items():
            parts = name.split(">>>")
            if len(parts) == 4 and parts[0] == prefix:
                d = agg.setdefault(parts[1], [0, 0])
                d[0 if parts[3] == "uplink" else 1] += val
        return agg

    # per-client (user>>>"<cid>.<email>">>>traffic>>>up|down)
    for ident, (raw_up, raw_down) in collect("user").items():
        cid = ident.split(".", 1)[0]
        if not cid.isdigit():
            continue
        cid = int(cid)
        prev = db.query("SELECT up, down, multiplier, raw_up, raw_down, last_seen "
                        "FROM clients WHERE id=?", (cid,), one=True)
        if not prev:
            continue
        mult = prev["multiplier"] or 1.0
        d_up = _delta(raw_up, prev["raw_up"] or 0)
        d_down = _delta(raw_down, prev["raw_down"] or 0)
        new_up = prev["up"] + int(d_up * mult)
        new_down = prev["down"] + int(d_down * mult)
        online = 1 if (d_up > 0 or d_down > 0) else 0
        db.execute("UPDATE clients SET up=?, down=?, raw_up=?, raw_down=?, online=?, last_seen=? "
                   "WHERE id=?",
                   (new_up, new_down, raw_up, raw_down, online,
                    now if online else (prev["last_seen"] or 0), cid))

    # per-inbound (inbound>>>inbound-<id>>>>traffic>>>up|down)
    for tag, (raw_up, raw_down) in collect("inbound").items():
        if not (tag.startswith("inbound-") and tag.split("-", 1)[1].isdigit()):
            continue
        iid = int(tag.split("-", 1)[1])
        prev = db.query("SELECT up, down, raw_up, raw_down FROM inbounds WHERE id=?", (iid,), one=True)
        if not prev:
            continue
        new_up = prev["up"] + _delta(raw_up, prev["raw_up"] or 0)
        new_down = prev["down"] + _delta(raw_down, prev["raw_down"] or 0)
        db.execute("UPDATE inbounds SET up=?, down=?, raw_up=?, raw_down=? WHERE id=?",
                   (new_up, new_down, raw_up, raw_down, iid))

    # per-outbound
    for tag, (raw_up, raw_down) in collect("outbound").items():
        prev = db.query("SELECT up, down, raw_up, raw_down FROM outbounds WHERE tag=?", (tag,), one=True)
        if not prev:
            continue
        new_up = prev["up"] + _delta(raw_up, prev["raw_up"] or 0)
        new_down = prev["down"] + _delta(raw_down, prev["raw_down"] or 0)
        db.execute("UPDATE outbounds SET up=?, down=?, raw_up=?, raw_down=? WHERE tag=?",
                   (new_up, new_down, raw_up, raw_down, tag))


def _enforce():
    """Disable clients that are over quota / expired; mark stale clients offline."""
    now_ms = int(time.time() * 1000)
    now = int(time.time())
    changed = False
    for c in db.query("SELECT * FROM clients WHERE enable=1"):
        if c["total_gb"] and (c["up"] + c["down"]) >= c["total_gb"]:
            db.execute("UPDATE clients SET enable=0 WHERE id=?", (c["id"],))
            db.log(f"Client {c['email']} disabled: quota exceeded", "warning")
            changed = True
        elif c["expiry_time"] and c["expiry_time"] < now_ms:
            db.execute("UPDATE clients SET enable=0 WHERE id=?", (c["id"],))
            db.log(f"Client {c['email']} disabled: expired", "warning")
            changed = True
    db.execute("UPDATE clients SET online=0 WHERE last_seen < ?", (now - 60,))
    if changed and is_running():
        restart()


def _poller_loop():
    while True:
        try:
            if is_running():
                poll_once()
                _enforce()
        except Exception as e:
            db.log(f"poller error: {e}", "error")
        time.sleep(10)


def _start_poller():
    global _poller_started
    if _poller_started:
        return
    _poller_started = True
    t = threading.Thread(target=_poller_loop, daemon=True)
    t.start()


# ----------------------------------------------------------------- self-update
def update_panel(repo_url=None):
    """Update the panel source from GitHub.

    Uses `git pull` when the install is a git checkout; otherwise downloads the
    repo zip and overlays the .py / templates / static files (DB is preserved).
    """
    repo_url = (repo_url or db.get_settings().get("repo_url")
                or "https://github.com/S1rChips/TakhtJamshid-UI").rstrip("/")
    if os.path.isdir(os.path.join(BASE, ".git")):
        try:
            out = subprocess.run(["git", "-C", BASE, "pull", "--ff-only"],
                                 capture_output=True, text=True, timeout=120)
            ok = out.returncode == 0
            db.log("Panel update via git: " + (out.stdout or out.stderr).strip()[-200:])
            return ok, (out.stdout + out.stderr).strip()[-500:]
        except Exception as e:
            return False, str(e)
    # zip overlay
    try:
        url = repo_url + "/archive/refs/heads/main.zip"
        tmp = os.path.join(BASE, "_update.zip")
        req = urllib.request.Request(url, headers={"User-Agent": "TakhtJamshid"})
        with urllib.request.urlopen(req, timeout=120) as r, open(tmp, "wb") as f:
            f.write(r.read())
        import shutil
        extract_dir = os.path.join(BASE, "_update")
        if os.path.isdir(extract_dir):
            shutil.rmtree(extract_dir, ignore_errors=True)
        with zipfile.ZipFile(tmp) as z:
            z.extractall(extract_dir)
        roots = [os.path.join(extract_dir, d) for d in os.listdir(extract_dir)]
        src = next((d for d in roots if os.path.isdir(d)), extract_dir)
        for rel in ("app.py", "database.py", "xray_core.py", "xray_config.py",
                    "telegram_bot.py", "requirements.txt", "templates", "static"):
            s = os.path.join(src, rel)
            d = os.path.join(BASE, rel)
            if not os.path.exists(s):
                continue
            if os.path.isdir(s):
                shutil.copytree(s, d, dirs_exist_ok=True)
            else:
                shutil.copy2(s, d)
        shutil.rmtree(extract_dir, ignore_errors=True)
        os.remove(tmp)
        db.log("Panel updated from zip")
        return True, "updated from zip (restart the panel to apply)"
    except Exception as e:
        db.log(f"Panel update failed: {e}", "error")
        return False, str(e)


def current_version():
    vf = os.path.join(BASE, "VERSION")
    if os.path.exists(vf):
        try:
            with open(vf) as f:
                return f.read().strip()
        except Exception:
            pass
    return "1.0.0"
