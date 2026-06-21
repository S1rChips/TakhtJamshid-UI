"""
TakhtJamshid Panel - main Flask application (real Xray-core integration).
Run:  python app.py   ->  http://127.0.0.1:2053   (admin / admin)
"""
import io
import json
import time
import functools

from flask import (Flask, request, jsonify, session, redirect,
                   url_for, render_template, Response, abort)

import database as db
import xray_config as xc
import xray_core as core

try:
    import qrcode
    import qrcode.image.svg as qsvg
    HAS_QR = True
except Exception:
    HAS_QR = False

app = Flask(__name__)
app.secret_key = "takhtjamshid-secret-" + db.new_subid()

db.init_db()

# Auto-start xray on boot if it was running before and binary exists
if core.xray_path() and db.get_settings().get("xray_status") == "running":
    try:
        core.start()
    except Exception:
        pass


# ------------------------------------------------------------------ auth
def login_required(f):
    @functools.wraps(f)
    def wrap(*a, **k):
        if not session.get("uid"):
            if request.path.startswith("/api/"):
                return jsonify({"ok": False, "error": "unauthorized"}), 401
            return redirect(url_for("login"))
        return f(*a, **k)
    return wrap


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        data = request.get_json(silent=True) or request.form
        u = db.verify_user(data.get("username", ""), data.get("password", ""))
        if u:
            session["uid"] = u["id"]
            session["username"] = u["username"]
            db.log(f"User {u['username']} logged in")
            return jsonify({"ok": True})
        return jsonify({"ok": False, "error": "نام کاربری یا رمز عبور اشتباه است"}), 401
    if session.get("uid"):
        return redirect(url_for("dashboard"))
    return render_template("login.html", settings=db.get_settings())


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/")
@login_required
def dashboard():
    return render_template("dashboard.html",
                           settings=db.get_settings(),
                           username=session.get("username"))


def host_from_request():
    return request.host.split(":")[0]


# ------------------------------------------------------------------ overview
@app.route("/api/overview")
@login_required
def api_overview():
    inbounds = db.query("SELECT * FROM inbounds")
    clients = db.query("SELECT * FROM clients")
    outbounds = db.query("SELECT * FROM outbounds")
    nodes = db.query("SELECT * FROM nodes")
    now = int(time.time())
    active = sum(1 for c in clients if c["enable"] and
                 (c["expiry_time"] == 0 or c["expiry_time"] > now * 1000))
    online = sum(1 for c in clients if c["online"])
    up = sum(i["up"] for i in inbounds)
    down = sum(i["down"] for i in inbounds)
    st = core.status()
    return jsonify({"ok": True, "inbounds": len(inbounds), "clients": len(clients),
                    "active_clients": active, "online": online,
                    "outbounds": len(outbounds), "nodes": len(nodes),
                    "up": up, "down": down, "total": up + down,
                    "xray_status": "running" if st["running"] else "stopped",
                    "xray_version": st["version"], "xray_installed": st["installed"]})


# ------------------------------------------------------------------ inbounds
@app.route("/api/inbounds")
@login_required
def api_inbounds():
    inbounds = db.query("SELECT * FROM inbounds ORDER BY id DESC")
    for ib in inbounds:
        ib["clients"] = db.query("SELECT * FROM clients WHERE inbound_id=?", (ib["id"],))
        ib["client_count"] = len(ib["clients"])
    return jsonify({"ok": True, "inbounds": inbounds})


def _apply_and_reload():
    if core.is_running():
        core.restart()


@app.route("/api/inbounds", methods=["POST"])
@login_required
def api_inbound_create():
    d = request.get_json(force=True)
    iid = db.execute(
        """INSERT INTO inbounds
        (node_id, remark, enable, protocol, listen, port, network, security,
         settings, stream_settings, sniffing, total, expiry_time, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (d.get("node_id") or None, d.get("remark", "inbound"),
         int(d.get("enable", 1)), d.get("protocol", "vless"),
         d.get("listen", ""), int(d.get("port", 443)),
         d.get("network", "tcp"), d.get("security", "none"),
         json.dumps(d.get("settings", {})), json.dumps(d.get("stream_settings", {})),
         json.dumps(d.get("sniffing", {"enabled": True})),
         int(d.get("total", 0)), int(d.get("expiry_time", 0)), int(time.time())))
    db.log(f"Inbound created on port {d.get('port')}")
    _apply_and_reload()
    return jsonify({"ok": True, "id": iid})


@app.route("/api/inbounds/<int:iid>", methods=["PUT"])
@login_required
def api_inbound_update(iid):
    d = request.get_json(force=True)
    db.execute(
        """UPDATE inbounds SET remark=?, enable=?, protocol=?, listen=?, port=?,
           network=?, security=?, settings=?, stream_settings=?, total=?, expiry_time=?
           WHERE id=?""",
        (d.get("remark"), int(d.get("enable", 1)), d.get("protocol"),
         d.get("listen", ""), int(d.get("port")), d.get("network", "tcp"),
         d.get("security", "none"), json.dumps(d.get("settings", {})),
         json.dumps(d.get("stream_settings", {})), int(d.get("total", 0)),
         int(d.get("expiry_time", 0)), iid))
    _apply_and_reload()
    return jsonify({"ok": True})


@app.route("/api/inbounds/<int:iid>", methods=["DELETE"])
@login_required
def api_inbound_delete(iid):
    db.execute("DELETE FROM inbounds WHERE id=?", (iid,))
    db.log(f"Inbound {iid} deleted")
    _apply_and_reload()
    return jsonify({"ok": True})


@app.route("/api/inbounds/<int:iid>/toggle", methods=["POST"])
@login_required
def api_inbound_toggle(iid):
    ib = db.query("SELECT enable FROM inbounds WHERE id=?", (iid,), one=True)
    db.execute("UPDATE inbounds SET enable=? WHERE id=?", (0 if ib["enable"] else 1, iid))
    _apply_and_reload()
    return jsonify({"ok": True})


@app.route("/api/inbounds/<int:iid>/reset", methods=["POST"])
@login_required
def api_inbound_reset(iid):
    db.execute("UPDATE inbounds SET up=0, down=0 WHERE id=?", (iid,))
    db.execute("UPDATE clients SET up=0, down=0 WHERE inbound_id=?", (iid,))
    return jsonify({"ok": True})


# ------------------------------------------------------------------ clients
@app.route("/api/inbounds/<int:iid>/clients", methods=["POST"])
@login_required
def api_client_create(iid):
    if not db.query("SELECT id FROM inbounds WHERE id=?", (iid,), one=True):
        return jsonify({"ok": False, "error": "inbound not found"}), 404
    d = request.get_json(force=True)
    cid = db.execute(
        """INSERT INTO clients
        (inbound_id, email, uuid, password, flow, enable, total_gb, expiry_time,
         limit_ip, sub_id, tg_id, multiplier, comment, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (iid, d.get("email", "client"), d.get("uuid") or db.new_uuid(),
         d.get("password", ""), d.get("flow", ""), int(d.get("enable", 1)),
         int(d.get("total_gb", 0)), int(d.get("expiry_time", 0)),
         int(d.get("limit_ip", 0)), d.get("sub_id") or db.new_subid(),
         d.get("tg_id", ""), float(d.get("multiplier", 1) or 1),
         d.get("comment", ""), int(time.time())))
    db.log(f"Client {d.get('email')} added to inbound {iid}")
    _apply_and_reload()
    return jsonify({"ok": True, "id": cid})


@app.route("/api/clients/<int:cid>", methods=["PUT"])
@login_required
def api_client_update(cid):
    d = request.get_json(force=True)
    db.execute(
        """UPDATE clients SET email=?, uuid=?, password=?, flow=?, enable=?,
           total_gb=?, expiry_time=?, limit_ip=?, tg_id=?, multiplier=?, comment=? WHERE id=?""",
        (d.get("email"), d.get("uuid"), d.get("password", ""), d.get("flow", ""),
         int(d.get("enable", 1)), int(d.get("total_gb", 0)),
         int(d.get("expiry_time", 0)), int(d.get("limit_ip", 0)),
         d.get("tg_id", ""), float(d.get("multiplier", 1) or 1),
         d.get("comment", ""), cid))
    _apply_and_reload()
    return jsonify({"ok": True})


@app.route("/api/clients/<int:cid>", methods=["DELETE"])
@login_required
def api_client_delete(cid):
    db.execute("DELETE FROM clients WHERE id=?", (cid,))
    _apply_and_reload()
    return jsonify({"ok": True})


@app.route("/api/clients/<int:cid>/toggle", methods=["POST"])
@login_required
def api_client_toggle(cid):
    c = db.query("SELECT enable FROM clients WHERE id=?", (cid,), one=True)
    db.execute("UPDATE clients SET enable=? WHERE id=?", (0 if c["enable"] else 1, cid))
    _apply_and_reload()
    return jsonify({"ok": True})


@app.route("/api/clients/<int:cid>/reset", methods=["POST"])
@login_required
def api_client_reset(cid):
    db.execute("UPDATE clients SET up=0, down=0 WHERE id=?", (cid,))
    return jsonify({"ok": True})


@app.route("/api/clients/<int:cid>/link")
@login_required
def api_client_link(cid):
    c = db.query("SELECT * FROM clients WHERE id=?", (cid,), one=True)
    if not c:
        return jsonify({"ok": False}), 404
    ib = db.query("SELECT * FROM inbounds WHERE id=?", (c["inbound_id"],), one=True)
    host = request.args.get("host") or host_from_request()
    return jsonify({"ok": True, "link": xc.build_link(ib, c, host),
                    "sub": f"/sub/{c['sub_id']}", "info": f"/i/{c['sub_id']}",
                    "up": c["up"], "down": c["down"], "total": c["total_gb"],
                    "expiry": c["expiry_time"], "multiplier": c["multiplier"]})


@app.route("/api/clients/<int:cid>/qr")
@login_required
def api_client_qr(cid):
    if not HAS_QR:
        return jsonify({"ok": False, "error": "qrcode lib not installed"}), 500
    c = db.query("SELECT * FROM clients WHERE id=?", (cid,), one=True)
    ib = db.query("SELECT * FROM inbounds WHERE id=?", (c["inbound_id"],), one=True)
    host = request.args.get("host") or host_from_request()
    link = xc.build_link(ib, c, host)
    img = qrcode.make(link, image_factory=qsvg.SvgPathImage)
    buf = io.BytesIO()
    img.save(buf)
    buf.seek(0)
    return Response(buf.read(), mimetype="image/svg+xml")


# ------------------------------------------------------------------ outbounds
@app.route("/api/outbounds")
@login_required
def api_outbounds():
    return jsonify({"ok": True, "outbounds": db.query("SELECT * FROM outbounds ORDER BY id DESC")})


def _build_outbound_settings(d):
    proto = d.get("protocol", "freedom")
    addr = d.get("address", "")
    port = int(d.get("port", 0) or 0)
    user, pw = d.get("user", ""), d.get("pass", "")
    if proto in ("http", "socks") and addr:
        srv = {"address": addr, "port": port}
        if user:
            srv["users"] = [{"user": user, "pass": pw}]
        return {"servers": [srv]}
    if proto in ("vmess", "vless") and addr:
        user_obj = {"id": d.get("uuid", ""), "encryption": "none"} if proto == "vless" \
            else {"id": d.get("uuid", ""), "alterId": 0, "security": "auto"}
        return {"vnext": [{"address": addr, "port": port, "users": [user_obj]}]}
    if proto == "trojan" and addr:
        return {"servers": [{"address": addr, "port": port, "password": pw or d.get("uuid", "")}]}
    if proto == "wireguard":
        return {"secretKey": d.get("secretKey", ""),
                "peers": [{"publicKey": d.get("peerKey", ""), "endpoint": f"{addr}:{port}",
                           "allowedIPs": ["0.0.0.0/0", "::/0"]}]}
    if proto == "blackhole":
        return {"response": {"type": "http"}}
    return {}


@app.route("/api/outbounds", methods=["POST"])
@login_required
def api_outbound_create():
    d = request.get_json(force=True)
    settings = d.get("settings") or _build_outbound_settings(d)
    stream = {}
    if d.get("security") and d.get("security") != "none":
        stream = {"security": d["security"], "tlsSettings": {"serverName": d.get("sni", "")}}
    oid = db.execute(
        """INSERT INTO outbounds
        (tag, protocol, address, port, settings, stream_settings, send_through, enable, created_at)
        VALUES (?,?,?,?,?,?,?,?,?)""",
        (d.get("tag", "proxy"), d.get("protocol", "freedom"), d.get("address", ""),
         int(d.get("port", 0) or 0), json.dumps(settings), json.dumps(stream),
         d.get("send_through", ""), int(d.get("enable", 1)), int(time.time())))
    db.log(f"Outbound {d.get('tag')} created")
    _apply_and_reload()
    return jsonify({"ok": True, "id": oid})


@app.route("/api/outbounds/<int:oid>", methods=["DELETE"])
@login_required
def api_outbound_delete(oid):
    db.execute("DELETE FROM outbounds WHERE id=?", (oid,))
    _apply_and_reload()
    return jsonify({"ok": True})


@app.route("/api/outbounds/<int:oid>/reset", methods=["POST"])
@login_required
def api_outbound_reset(oid):
    db.execute("UPDATE outbounds SET up=0, down=0 WHERE id=?", (oid,))
    return jsonify({"ok": True})


# ------------------------------------------------------------------ routing
@app.route("/api/routing")
@login_required
def api_routing():
    return jsonify({"ok": True, "rules": db.query("SELECT * FROM routing_rules ORDER BY id DESC")})


@app.route("/api/routing", methods=["POST"])
@login_required
def api_routing_create():
    d = request.get_json(force=True)
    rid = db.execute(
        """INSERT INTO routing_rules (name, source, domain, ip, port, outbound_tag, enable, created_at)
           VALUES (?,?,?,?,?,?,?,?)""",
        (d.get("name", "rule"), d.get("source", ""), d.get("domain", ""),
         d.get("ip", ""), d.get("port", ""), d.get("outbound_tag", "direct"),
         int(d.get("enable", 1)), int(time.time())))
    _apply_and_reload()
    return jsonify({"ok": True, "id": rid})


@app.route("/api/routing/<int:rid>", methods=["DELETE"])
@login_required
def api_routing_delete(rid):
    db.execute("DELETE FROM routing_rules WHERE id=?", (rid,))
    _apply_and_reload()
    return jsonify({"ok": True})


# ------------------------------------------------------------------ nodes
@app.route("/api/nodes")
@login_required
def api_nodes():
    return jsonify({"ok": True, "nodes": db.query("SELECT * FROM nodes ORDER BY id DESC")})


@app.route("/api/nodes", methods=["POST"])
@login_required
def api_node_create():
    d = request.get_json(force=True)
    nid = db.execute(
        "INSERT INTO nodes (name, address, api_port, status, created_at) VALUES (?,?,?,?,?)",
        (d.get("name", "node"), d.get("address", ""), int(d.get("api_port", 0)),
         "online", int(time.time())))
    return jsonify({"ok": True, "id": nid})


@app.route("/api/nodes/<int:nid>", methods=["DELETE"])
@login_required
def api_node_delete(nid):
    db.execute("DELETE FROM nodes WHERE id=?", (nid,))
    return jsonify({"ok": True})


# ------------------------------------------------------------------ xray control
@app.route("/api/xray/status")
@login_required
def api_xray_status():
    return jsonify({"ok": True, **core.status()})


@app.route("/api/xray/<action>", methods=["POST"])
@login_required
def api_xray(action):
    if action == "restart":
        ok, msg = core.restart()
    elif action == "start":
        ok, msg = core.start()
    elif action == "stop":
        ok, msg = core.stop()
    elif action == "install":
        ok, msg = core.ensure_binary()
    elif action == "test":
        ok, msg = core.test_config()
    else:
        return jsonify({"ok": False, "error": "unknown action"}), 400
    return jsonify({"ok": ok, "message": msg, **core.status()})


@app.route("/api/xray/config")
@login_required
def api_xray_config():
    return jsonify({"ok": True, "config": core.build_config()})


@app.route("/api/xray/keys")
@login_required
def api_xray_keys():
    keys = core.gen_x25519()
    keys["shortId"] = core.gen_short_id()
    return jsonify({"ok": True, **keys})


# ------------------------------------------------------------------ settings / account
@app.route("/api/settings", methods=["GET", "POST"])
@login_required
def api_settings():
    if request.method == "POST":
        d = request.get_json(force=True)
        protected = {"panel_title"}  # panel/site name is fixed, not editable
        for k, v in d.items():
            if k in protected:
                continue
            db.set_setting(k, v)
        return jsonify({"ok": True})
    return jsonify({"ok": True, "settings": db.get_settings()})


@app.route("/api/account", methods=["POST"])
@login_required
def api_account():
    d = request.get_json(force=True)
    if not d.get("username"):
        return jsonify({"ok": False, "error": "نام کاربری لازم است"}), 400
    db.change_credentials(session["uid"], d.get("username"), d.get("password", ""))
    session["username"] = d.get("username")
    db.log("Account credentials updated")
    return jsonify({"ok": True})


@app.route("/api/logs")
@login_required
def api_logs():
    return jsonify({"ok": True, "logs": db.query("SELECT * FROM logs ORDER BY id DESC LIMIT 150")})


# ------------------------------------------------------------------ subscription (public)
def _collect_sub(sub_id):
    rows = db.query("SELECT * FROM clients WHERE sub_id=?", (sub_id,))
    if not rows:
        return None
    host = host_from_request()
    links, up, down, total, expiry, name = [], 0, 0, 0, 0, ""
    for c in rows:
        ib = db.query("SELECT * FROM inbounds WHERE id=?", (c["inbound_id"],), one=True)
        if ib:
            links.append(xc.build_link(ib, c, host))
        up += c["up"]; down += c["down"]; total += c["total_gb"]
        expiry = c["expiry_time"] or expiry
        name = c["email"]
    return {"rows": rows, "links": links, "up": up, "down": down,
            "total": total, "expiry": expiry, "name": name}


@app.route("/sub/<sub_id>")
def subscription(sub_id):
    s = _collect_sub(sub_id)
    if not s:
        abort(404)
    fmt = request.args.get("format", "base64")
    headers = xc.sub_headers(s["up"], s["down"], s["total"], s["expiry"])
    if fmt in ("raw", "links"):
        return Response("\n".join(s["links"]), mimetype="text/plain", headers=headers)
    return Response(xc.build_subscription(s["links"]), mimetype="text/plain", headers=headers)


@app.route("/i/<sub_id>")
def subscription_info(sub_id):
    s = _collect_sub(sub_id)
    if not s:
        abort(404)
    used = s["up"] + s["down"]
    pct = min(100, used / s["total"] * 100) if s["total"] else 0
    return render_template("sub.html", s=s, used=used, pct=round(pct, 1),
                           sub_id=sub_id, settings=db.get_settings())


if __name__ == "__main__":
    print("=" * 54)
    print("  TakhtJamshid Panel  -  http://127.0.0.1:2053")
    print("  user: admin   pass: admin")
    print("=" * 54)
    app.run(host="0.0.0.0", port=2053, debug=False, threaded=True)
