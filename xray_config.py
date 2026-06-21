"""
TakhtJamshid - Xray config & share-link builder (original implementation).
Produces a *valid* Xray-core config.json (protocol-aware) plus standard
client share URIs (vless/vmess/trojan/ss) and subscription bodies.
"""
import json
import base64
from urllib.parse import quote, urlencode


def _b64(s: str) -> str:
    return base64.b64encode(s.encode()).decode()


def _load(j, default=None):
    if isinstance(j, dict):
        return j
    try:
        return json.loads(j or "{}")
    except Exception:
        return default if default is not None else {}


# ----------------------------------------------------------------- stream
def stream_to_xray(ss: dict, net: str, sec: str) -> dict:
    """Translate stored stream settings into a valid Xray streamSettings block."""
    out = {"network": net, "security": sec if sec != "none" else "none"}

    if net == "tcp":
        ht = ss.get("headerType", "none")
        if ht == "http":
            out["tcpSettings"] = {"header": {"type": "http",
                "request": {"path": [ss.get("path", "/")],
                            "headers": {"Host": [ss.get("host", "")]} if ss.get("host") else {}}}}
        else:
            out["tcpSettings"] = {"header": {"type": "none"}}
    elif net == "kcp":
        out["kcpSettings"] = {"header": {"type": ss.get("headerType", "none")},
                              "seed": ss.get("seed", "")}
    elif net == "ws":
        out["wsSettings"] = {"path": ss.get("path", "/"),
                             "headers": {"Host": ss["host"]} if ss.get("host") else {}}
    elif net == "grpc":
        out["grpcSettings"] = {"serviceName": ss.get("serviceName", ""),
                               "multiMode": ss.get("mode", "gun") == "multi"}
    elif net == "httpupgrade":
        out["httpupgradeSettings"] = {"path": ss.get("path", "/"), "host": ss.get("host", "")}
    elif net == "xhttp":
        out["xhttpSettings"] = {"path": ss.get("path", "/"), "host": ss.get("host", ""),
                                "mode": ss.get("xmode", "auto")}

    if sec == "tls":
        tls = {"serverName": ss.get("sni", ""),
               "alpn": [a.strip() for a in ss.get("alpn", "").split(",") if a.strip()] or ["h2", "http/1.1"],
               "allowInsecure": bool(ss.get("allowInsecure", False))}
        if ss.get("fp"):
            tls["fingerprint"] = ss["fp"]
        if ss.get("certFile") and ss.get("keyFile"):
            tls["certificates"] = [{"certificateFile": ss["certFile"], "keyFile": ss["keyFile"]}]
        out["tlsSettings"] = tls
    elif sec == "xtls":
        out["xtlsSettings"] = {"serverName": ss.get("sni", ""),
                               "alpn": ["h2", "http/1.1"]}
    elif sec == "reality":
        out["realitySettings"] = {
            "show": False,
            "dest": ss.get("dest", "www.microsoft.com:443"),
            "xver": 0,
            "serverNames": [s.strip() for s in ss.get("sni", "www.microsoft.com").split(",") if s.strip()],
            "privateKey": ss.get("privateKey", ""),
            "shortIds": [s.strip() for s in str(ss.get("shortIds", ss.get("shortId", ""))).split(",")],
            "fingerprint": ss.get("fp", "chrome"),
        }
        if ss.get("spiderX"):
            out["realitySettings"]["spiderX"] = ss["spiderX"]
    return out


# ----------------------------------------------------------------- inbound settings
def inbound_settings(protocol: str, ib_settings: dict, clients: list) -> dict:
    """Build the protocol-specific `settings` object incl. all clients."""
    p = protocol

    if p == "vless":
        cl = [{"id": c["uuid"], "email": f"{c['id']}.{c['email']}",
               "flow": c.get("flow", "")} for c in clients]
        s = {"clients": cl, "decryption": "none"}
        if ib_settings.get("fallbacks"):
            s["fallbacks"] = ib_settings["fallbacks"]
        return s

    if p == "vmess":
        cl = [{"id": c["uuid"], "email": f"{c['id']}.{c['email']}", "alterId": 0}
              for c in clients]
        return {"clients": cl}

    if p == "trojan":
        cl = [{"password": c.get("password") or c["uuid"],
               "email": f"{c['id']}.{c['email']}", "flow": c.get("flow", "")}
              for c in clients]
        s = {"clients": cl}
        if ib_settings.get("fallbacks"):
            s["fallbacks"] = ib_settings["fallbacks"]
        return s

    if p == "shadowsocks":
        method = ib_settings.get("method", "chacha20-ietf-poly1305")
        first = clients[0] if clients else None
        s = {"method": method,
             "password": (first.get("password") or first["uuid"]) if first else ib_settings.get("password", ""),
             "network": "tcp,udp"}
        if clients:
            s["clients"] = [{"method": method,
                             "password": c.get("password") or c["uuid"],
                             "email": f"{c['id']}.{c['email']}"} for c in clients]
        return s

    if p == "socks":
        accts = [{"user": c.get("email", "user"), "pass": c.get("password") or c["uuid"]}
                 for c in clients]
        s = {"udp": True}
        if accts:
            s["auth"] = "password"
            s["accounts"] = accts
        return s

    if p == "http":
        accts = [{"user": c.get("email", "user"), "pass": c.get("password") or c["uuid"]}
                 for c in clients]
        return {"accounts": accts, "allowTransparent": False}

    if p == "dokodemo-door":
        return {"address": ib_settings.get("target_addr", "127.0.0.1"),
                "port": int(ib_settings.get("target_port", 0) or 0),
                "network": ib_settings.get("net", "tcp,udp")}

    if p == "wireguard":
        return {"secretKey": ib_settings.get("secretKey", ""),
                "peers": ib_settings.get("peers", [])}

    return ib_settings or {}


# ----------------------------------------------------------------- share links
def _stream_params(ss: dict, net: str, sec: str) -> dict:
    p = {"type": net, "security": sec}
    if net == "ws":
        p["path"] = ss.get("path", "/")
        if ss.get("host"):
            p["host"] = ss["host"]
    elif net == "grpc":
        p["serviceName"] = ss.get("serviceName", "")
        p["mode"] = ss.get("mode", "gun")
    elif net in ("httpupgrade", "xhttp"):
        p["path"] = ss.get("path", "/")
        if ss.get("host"):
            p["host"] = ss["host"]
    elif net == "tcp" and ss.get("headerType") == "http":
        p["headerType"] = "http"
        if ss.get("host"):
            p["host"] = ss["host"]
        p["path"] = ss.get("path", "/")
    elif net == "kcp":
        p["headerType"] = ss.get("headerType", "none")
        if ss.get("seed"):
            p["seed"] = ss["seed"]

    if sec in ("tls", "xtls"):
        if ss.get("sni"):
            p["sni"] = ss["sni"]
        if ss.get("fp"):
            p["fp"] = ss["fp"]
        if ss.get("alpn"):
            p["alpn"] = ss["alpn"]
    elif sec == "reality":
        p["sni"] = (ss.get("sni", "") or "").split(",")[0]
        p["fp"] = ss.get("fp", "chrome")
        p["pbk"] = ss.get("publicKey", "")
        sid = str(ss.get("shortIds", ss.get("shortId", "")))
        p["sid"] = sid.split(",")[0]
        if ss.get("spiderX"):
            p["spx"] = ss["spiderX"]
    return {k: v for k, v in p.items() if v not in ("", None)}


def build_link(inbound: dict, client: dict, host: str) -> str:
    proto = inbound["protocol"]
    port = inbound["port"]
    net = inbound.get("network", "tcp")
    sec = inbound.get("security", "none")
    ss = _load(inbound.get("stream_settings"))
    remark = f"{inbound['remark']}-{client['email']}"
    flow = client.get("flow") or ""

    if proto == "vless":
        params = _stream_params(ss, net, sec)
        if flow:
            params["flow"] = flow
        q = urlencode(params, safe="/+")
        return f"vless://{client['uuid']}@{host}:{port}?{q}#{quote(remark)}"

    if proto == "vmess":
        conf = {"v": "2", "ps": remark, "add": host, "port": str(port),
                "id": client["uuid"], "aid": "0", "scy": "auto", "net": net,
                "type": ss.get("headerType", "none"), "host": ss.get("host", ""),
                "path": ss.get("path", ss.get("serviceName", "")),
                "tls": sec if sec != "none" else "", "sni": ss.get("sni", "")}
        return "vmess://" + _b64(json.dumps(conf, ensure_ascii=False))

    if proto == "trojan":
        params = _stream_params(ss, net, sec)
        q = urlencode(params, safe="/+")
        pw = client.get("password") or client["uuid"]
        return f"trojan://{quote(pw)}@{host}:{port}?{q}#{quote(remark)}"

    if proto == "shadowsocks":
        method = "chacha20-ietf-poly1305"
        pw = client.get("password") or client["uuid"]
        return f"ss://{_b64(f'{method}:{pw}')}@{host}:{port}#{quote(remark)}"

    if proto == "socks":
        userinfo = _b64(f"{client.get('email','user')}:{client.get('password') or client['uuid']}")
        return f"socks://{userinfo}@{host}:{port}#{quote(remark)}"

    return f"# {proto} share link not supported"


def build_subscription(links: list) -> str:
    return base64.b64encode("\n".join(links).encode()).decode()


def sub_headers(up, down, total, expiry_ms):
    expire = int(expiry_ms / 1000) if expiry_ms else 0
    return {
        "Subscription-Userinfo": f"upload={up}; download={down}; total={total}; expire={expire}",
        "Profile-Update-Interval": "12",
        "Content-Disposition": 'inline; filename="TakhtJamshid"',
    }


# ----------------------------------------------------------------- full config
def assemble_config(inbounds, clients_by_inbound, outbounds, routing_rules,
                    api_port=62789, log_level="warning"):
    """Build a complete, runnable Xray config.json."""
    in_list = []
    for ib in inbounds:
        net = ib.get("network", "tcp")
        sec = ib.get("security", "none")
        ss = _load(ib.get("stream_settings"))
        ib_set = _load(ib.get("settings"))
        clients = clients_by_inbound.get(ib["id"], [])
        node = {
            "tag": f"inbound-{ib['id']}",
            "listen": ib.get("listen") or None,
            "port": int(ib["port"]),
            "protocol": ib["protocol"],
            "settings": inbound_settings(ib["protocol"], ib_set, clients),
            "streamSettings": stream_to_xray(ss, net, sec),
            "sniffing": {"enabled": True, "destOverride": ["http", "tls", "quic"]},
        }
        if node["listen"] is None:
            node.pop("listen")
        in_list.append(node)

    # outbounds
    out_list = []
    for ob in outbounds:
        settings = _load(ob.get("settings"))
        node = {"tag": ob["tag"], "protocol": ob["protocol"], "settings": settings}
        ss = _load(ob.get("stream_settings"))
        if ss:
            node["streamSettings"] = ss
        if ob.get("send_through"):
            node["sendThrough"] = ob["send_through"]
        out_list.append(node)
    if not any(o["tag"] == "direct" for o in out_list):
        out_list.append({"tag": "direct", "protocol": "freedom", "settings": {}})
    if not any(o["tag"] == "blocked" for o in out_list):
        out_list.append({"tag": "blocked", "protocol": "blackhole", "settings": {}})

    # routing
    rules = [{"type": "field", "inboundTag": ["api"], "outboundTag": "api"}]
    for r in routing_rules:
        rule = {"type": "field", "outboundTag": r["outbound_tag"]}
        if r.get("domain"):
            rule["domain"] = [d.strip() for d in r["domain"].split(",") if d.strip()]
        if r.get("ip"):
            rule["ip"] = [i.strip() for i in r["ip"].split(",") if i.strip()]
        if r.get("port"):
            rule["port"] = r["port"]
        if r.get("source"):
            rule["source"] = [s.strip() for s in r["source"].split(",") if s.strip()]
        rules.append(rule)

    # API inbound for live stats
    api_inbound = {
        "tag": "api", "listen": "127.0.0.1", "port": int(api_port),
        "protocol": "dokodemo-door", "settings": {"address": "127.0.0.1"},
    }

    return {
        "log": {"loglevel": log_level},
        "api": {"tag": "api", "services": ["HandlerService", "LoggerService", "StatsService"]},
        "stats": {},
        "policy": {
            "levels": {"0": {"statsUserUplink": True, "statsUserDownlink": True}},
            "system": {"statsInboundUplink": True, "statsInboundDownlink": True,
                       "statsOutboundUplink": True, "statsOutboundDownlink": True},
        },
        "inbounds": [api_inbound] + in_list,
        "outbounds": out_list,
        "routing": {"domainStrategy": "AsIs", "rules": rules},
    }
