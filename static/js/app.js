/* ===== TakhtJamshid Panel — front-end controller (real Xray) ===== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const api = async (url, opt = {}) => {
  if (opt.body && typeof opt.body !== 'string') {
    opt.headers = { 'Content-Type': 'application/json', ...(opt.headers || {}) };
    opt.body = JSON.stringify(opt.body);
  }
  const r = await fetch(url, opt);
  if (r.status === 401) { window.location = '/login'; return {}; }
  return r.json();
};
const fmtBytes = (b) => {
  b = +b || 0; if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  return (b / Math.pow(1024, i)).toFixed(i ? 2 : 0) + ' ' + u[i];
};
const GB = 1073741824;
const fmtDate = (ms) => ms ? new Date(ms).toLocaleDateString('fa-IR') : '∞';
const daysFromNow = (d) => d ? Date.now() + d * 86400000 : 0;
const esc = (s) => (s == null ? '' : String(s)).replace(/"/g, '&quot;').replace(/</g, '&lt;');
const toast = (msg, type = 'ok') => {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${type === 'err' ? '✕' : '✓'}</span><span>${msg}</span>`;
  $('#toastWrap').appendChild(t);
  setTimeout(() => { t.style.opacity = 0; setTimeout(() => t.remove(), 300); }, 3200);
};
const copyText = (t) => { navigator.clipboard.writeText(t); toast('کپی شد'); };

const PROTOCOLS = ['vless', 'vmess', 'trojan', 'shadowsocks', 'socks', 'http', 'dokodemo-door', 'wireguard'];
const NETWORKS = ['tcp', 'kcp', 'ws', 'grpc', 'httpupgrade', 'xhttp'];
const SECURITY = ['none', 'tls', 'reality'];
const SS_METHODS = ['chacha20-ietf-poly1305', 'aes-256-gcm', 'aes-128-gcm', '2022-blake3-aes-256-gcm'];
const FLOWS = ['', 'xtls-rprx-vision'];
const TRANSPORT_PROTOS = ['vless', 'vmess', 'trojan', 'shadowsocks'];
const TITLES = { overview: 'داشبورد', inbounds: 'Inbounds', outbounds: 'Outbounds', routing: 'مسیریابی', nodes: 'نودها', xray: 'هسته Xray', logs: 'لاگ‌ها', settings: 'تنظیمات' };

/* ---------- Modal ---------- */
const Modal = {
  open(title, bodyHTML, footHTML, wide) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = bodyHTML;
    $('#modalFoot').innerHTML = footHTML || '';
    $('#modal').classList.toggle('wide', !!wide);
    $('#modalOverlay').classList.add('open');
  },
  close() { $('#modalOverlay').classList.remove('open'); }
};
$('#modalClose').onclick = Modal.close;
$('#modalOverlay').onclick = (e) => { if (e.target.id === 'modalOverlay') Modal.close(); };

/* ---------- Theme ---------- */
const themeToggle = $('#themeToggle');
const applyThemeIcon = () =>
  themeToggle.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '🌙' : '☀️';
themeToggle.onclick = () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  applyThemeIcon();
  api('/api/settings', { method: 'POST', body: { theme: next } });
};
applyThemeIcon();

/* ---------- Nav ---------- */
$('#menuToggle').onclick = () => $('#sidebar').classList.toggle('open');
$$('.nav-item').forEach(item => item.onclick = () => {
  $$('.nav-item').forEach(n => n.classList.remove('active'));
  item.classList.add('active');
  $('#pageTitle').textContent = TITLES[item.dataset.page];
  $('#sidebar').classList.remove('open');
  Pages[item.dataset.page]();
});

const Pages = {};

/* ============================ OVERVIEW ============================ */
Pages.overview = async () => {
  const d = await api('/api/overview');
  const card = (ico, label, value, sub, cls = '') => `
    <div class="stat-card ${cls}">
      <div class="label"><span class="ico">${ico}</span>${label}</div>
      <div class="value">${value}</div><div class="sub">${sub || ''}</div></div>`;
  const installBanner = d.xray_installed ? '' : `
    <div class="banner warn">
      <div>⚠ هسته‌ی Xray هنوز نصب نشده است. برای اجرای واقعی VPN روی پورت‌ها، باید نصب شود.</div>
      <button class="btn btn-primary btn-sm" onclick="installXray()">⬇ نصب خودکار Xray</button>
    </div>`;
  $('#content').innerHTML = `
    ${installBanner}
    <div class="stat-grid">
      ${card('⇄', 'Inbounds', d.inbounds, 'پورت‌های فعال')}
      ${card('👥', 'کلاینت‌ها', d.clients, `${d.active_clients} فعال`)}
      ${card('🟢', 'آنلاین', d.online, 'هم‌اکنون متصل')}
      ${card('⬢', 'نودها', d.nodes, 'سرورها')}
      ${card('⬆', 'آپلود', fmtBytes(d.up))}
      ${card('⬇', 'دانلود', fmtBytes(d.down))}
      ${card('Σ', 'کل ترافیک', fmtBytes(d.total))}
      ${card('⚙', 'هسته Xray', d.xray_status === 'running' ? 'فعال' : 'متوقف', d.xray_version, d.xray_status === 'running' ? 'good' : 'bad')}
    </div>
    <div class="panel"><div class="panel-head"><h3>کنترل سریع هسته</h3></div>
      <div class="pad row-btns">
        <button class="btn btn-primary" onclick="xrayAction('restart')">↻ ری‌استارت</button>
        <button class="btn" onclick="xrayAction('start')">▶ شروع</button>
        <button class="btn" onclick="xrayAction('stop')">⏹ توقف</button>
        <button class="btn btn-ghost" onclick="xrayAction('test')">✓ تست کانفیگ</button>
        <button class="btn btn-ghost" onclick="document.querySelector('[data-page=xray]').click()">config.json</button>
      </div></div>`;
  updateXrayPill(d.xray_status);
};

async function installXray() {
  toast('در حال دانلود Xray… (ممکن است چند ثانیه طول بکشد)');
  const d = await api('/api/xray/install', { method: 'POST' });
  toast(d.ok ? 'Xray نصب شد ✓' : ('خطا: ' + d.message), d.ok ? 'ok' : 'err');
  Pages.overview();
}

/* ============================ INBOUNDS ============================ */
Pages.inbounds = async () => {
  const d = await api('/api/inbounds');
  let rows = d.inbounds.length ? '' :
    `<tr><td colspan="8"><div class="empty"><div class="big">⇄</div>هنوز Inbound نساخته‌اید</div></td></tr>`;
  d.inbounds.forEach(ib => {
    const used = ib.up + ib.down, pct = ib.total ? Math.min(100, used / ib.total * 100) : 0;
    rows += `<tr>
      <td><span class="expand-btn" data-ib="${ib.id}">▸</span></td>
      <td><b>${esc(ib.remark)}</b></td>
      <td><span class="badge badge-proto">${ib.protocol}</span> <span class="badge badge-net">${ib.network}</span>${ib.security !== 'none' ? ` <span class="badge badge-sec">${ib.security}</span>` : ''}</td>
      <td>${ib.port}</td><td>${ib.client_count} 👥</td>
      <td>${fmtBytes(used)}${ib.total ? ' / ' + fmtBytes(ib.total) : ''}<div class="progress"><span style="width:${pct}%"></span></div></td>
      <td><label class="switch"><input type="checkbox" ${ib.enable ? 'checked' : ''} onchange="toggleInbound(${ib.id})"><span></span></label></td>
      <td class="actions">
        <button class="btn btn-sm btn-primary" onclick="ClientForm.open(${ib.id})">+ کلاینت</button>
        <button class="btn btn-sm" onclick="InboundForm.open(${ib.id})">✎</button>
        <button class="btn btn-sm" onclick="resetInbound(${ib.id})">↺</button>
        <button class="btn btn-sm btn-danger" onclick="delInbound(${ib.id})">✕</button>
      </td></tr>
      <tbody class="client-body" id="cb-${ib.id}" style="display:none">
        ${ib.clients.map(cl => clientRow(cl, ib)).join('') ||
          `<tr class="client-row"><td colspan="8" style="color:var(--text-dim)">کلاینتی وجود ندارد</td></tr>`}
      </tbody>`;
  });
  $('#content').innerHTML = `
    <div class="panel"><div class="panel-head"><h3>لیست Inbounds</h3>
      <button class="btn btn-primary" onclick="InboundForm.open()">+ Inbound جدید</button></div>
      <div class="table-wrap"><table>
        <thead><tr><th></th><th>نام</th><th>پروتکل</th><th>پورت</th><th>کلاینت</th><th>ترافیک</th><th>فعال</th><th>عملیات</th></tr></thead>
        <tbody>${rows}</tbody></table></div></div>`;
  $$('.expand-btn').forEach(b => b.onclick = () => {
    const body = $(`#cb-${b.dataset.ib}`), show = body.style.display === 'none';
    body.style.display = show ? '' : 'none'; b.classList.toggle('open', show);
  });
};

function clientRow(cl, ib) {
  const used = cl.up + cl.down, pct = cl.total_gb ? Math.min(100, used / cl.total_gb * 100) : 0;
  const expired = cl.expiry_time && cl.expiry_time < Date.now();
  return `<tr class="client-row">
    <td><span class="online-dot ${cl.online ? '' : 'off'}" title="${cl.online ? 'آنلاین' : 'آفلاین'}"></span></td>
    <td colspan="2"><b>${esc(cl.email)}</b>${cl.enable ? '' : ' <span class="badge badge-off">غیرفعال</span>'}</td>
    <td>${fmtBytes(used)}${cl.total_gb ? ' / ' + fmtBytes(cl.total_gb) : ''}<div class="progress"><span style="width:${pct}%"></span></div></td>
    <td>${expired ? '<span class="badge badge-off">منقضی</span>' : fmtDate(cl.expiry_time)}</td>
    <td>IP: ${cl.limit_ip || '∞'}</td>
    <td class="actions">
      <button class="btn btn-sm btn-primary" onclick="showLink(${cl.id})">🔗</button>
      <button class="btn btn-sm" onclick='ClientForm.open(${ib.id}, ${JSON.stringify(cl)})'>✎</button>
      <button class="btn btn-sm" onclick="toggleClient(${cl.id})">${cl.enable ? '⏸' : '▶'}</button>
      <button class="btn btn-sm btn-danger" onclick="delClient(${cl.id})">✕</button>
    </td></tr>`;
}

/* ---------- field helpers ---------- */
const fld = (label, inner, hint) =>
  `<div class="field"><label>${label}</label>${inner}${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
const inp = (id, val = '', ph = '', type = 'text') =>
  `<input id="${id}" type="${type}" value="${esc(val)}" placeholder="${esc(ph)}">`;
const sel = (id, arr, val) =>
  `<select id="${id}">${arr.map(o => `<option ${o === val ? 'selected' : ''} value="${o}">${o || '— هیچ —'}</option>`).join('')}</select>`;

/* ---------- Inbound form (dynamic per protocol/network/security) ---------- */
const InboundForm = {
  data: null, id: null,
  async open(id) {
    this.id = id || null;
    let ib = { remark: '', protocol: 'vless', port: 443, network: 'tcp', security: 'reality',
      listen: '', enable: 1, total: 0, stream_settings: {}, settings: {} };
    if (id) {
      const d = await api('/api/inbounds');
      ib = d.inbounds.find(x => x.id === id);
      ib.stream_settings = JSON.parse(ib.stream_settings || '{}');
      ib.settings = JSON.parse(ib.settings || '{}');
    }
    this.data = ib;
    Modal.open(id ? 'ویرایش Inbound' : 'Inbound جدید', `
      <div class="row">
        ${fld('نام (Remark)', inp('f-remark', ib.remark, 'my-inbound'))}
        ${fld('پورت', inp('f-port', ib.port, '443', 'number'))}
      </div>
      <div class="row">
        ${fld('پروتکل', sel('f-proto', PROTOCOLS, ib.protocol))}
        ${fld('Listen IP (اختیاری)', inp('f-listen', ib.listen, '0.0.0.0'))}
      </div>
      <div id="dyn-inbound"></div>
      ${fld('محدودیت کل ترافیک (GB، ۰=نامحدود)', inp('f-total', ib.total ? ib.total / GB : 0, '0', 'number'))}
    `, `<button class="btn btn-primary" id="ib-save">${id ? 'ذخیره' : 'ساخت'}</button>
        <button class="btn btn-ghost" onclick="Modal.close()">انصراف</button>`, true);
    $('#f-proto').onchange = () => this.render();
    this.render();
    $('#ib-save').onclick = () => this.save();
  },
  render() {
    const ib = this.data;
    const proto = $('#f-proto').value;
    const ss = ib.stream_settings || {}, set = ib.settings || {};
    const hasTransport = TRANSPORT_PROTOS.includes(proto);
    let html = '';

    if (hasTransport) {
      html += `<div class="row">
        ${fld('ترنسپورت (Network)', sel('f-net', NETWORKS, ib.network))}
        ${fld('امنیت (Security)', sel('f-sec', SECURITY, ib.security || 'none'))}
      </div><div id="dyn-net"></div><div id="dyn-sec"></div>`;
    }
    if (proto === 'shadowsocks') {
      html += `<div class="row">${fld('متد رمزنگاری', sel('f-method', SS_METHODS, set.method || SS_METHODS[0]))}<div></div></div>`;
    }
    if (proto === 'socks' || proto === 'http') {
      html = `<div class="banner info">برای این پروتکل، نام‌کاربری/رمز از طریق «کلاینت»‌ها ساخته می‌شود.</div>` + html;
    }
    if (proto === 'dokodemo-door') {
      html += `<div class="row">
        ${fld('آدرس مقصد', inp('f-target-addr', set.target_addr || '127.0.0.1'))}
        ${fld('پورت مقصد', inp('f-target-port', set.target_port || 0, '0', 'number'))}</div>`;
    }
    if (proto === 'wireguard') {
      html += `<div class="row">
        ${fld('Secret Key (سرور)', inp('f-wg-secret', set.secretKey || ''))}
        ${fld('Peer PublicKey', inp('f-wg-peer', (set.peers && set.peers[0] && set.peers[0].publicKey) || ''))}</div>`;
    }
    $('#dyn-inbound').innerHTML = html;
    if (hasTransport) {
      $('#f-net').onchange = () => this.renderNet();
      $('#f-sec').onchange = () => this.renderSec();
      this.renderNet(); this.renderSec();
    }
  },
  renderNet() {
    const ss = this.data.stream_settings || {}, net = $('#f-net').value;
    let h = '';
    if (net === 'tcp') h = `<div class="row">${fld('Header Type', sel('f-header', ['none', 'http'], ss.headerType || 'none'))}${fld('Host (برای http)', inp('f-host', ss.host || ''))}</div>` + fld('Path (برای http)', inp('f-path', ss.path || '/'));
    else if (net === 'ws') h = `<div class="row">${fld('Path', inp('f-path', ss.path || '/'))}${fld('Host', inp('f-host', ss.host || ''))}</div>`;
    else if (net === 'grpc') h = `<div class="row">${fld('serviceName', inp('f-svc', ss.serviceName || ''))}${fld('Mode', sel('f-mode', ['gun', 'multi'], ss.mode || 'gun'))}</div>`;
    else if (net === 'kcp') h = `<div class="row">${fld('Header', sel('f-header', ['none', 'srtp', 'utp', 'wechat-video', 'dtls', 'wireguard'], ss.headerType || 'none'))}${fld('Seed', inp('f-seed', ss.seed || ''))}</div>`;
    else if (net === 'httpupgrade' || net === 'xhttp') h = `<div class="row">${fld('Path', inp('f-path', ss.path || '/'))}${fld('Host', inp('f-host', ss.host || ''))}</div>`;
    $('#dyn-net').innerHTML = h;
  },
  renderSec() {
    const ss = this.data.stream_settings || {}, sec = $('#f-sec').value;
    let h = '';
    if (sec === 'tls') {
      h = `<div class="row">${fld('SNI (ServerName)', inp('f-sni', ss.sni || ''))}${fld('ALPN', inp('f-alpn', ss.alpn || 'h2,http/1.1'))}</div>
        <div class="row">${fld('Certificate File', inp('f-cert', ss.certFile || '', '/path/fullchain.pem'))}${fld('Key File', inp('f-key', ss.keyFile || '', '/path/privkey.pem'))}</div>
        <div class="switch-line"><span>allowInsecure</span><label class="switch"><input type="checkbox" id="f-insecure" ${ss.allowInsecure ? 'checked' : ''}><span></span></label></div>`;
    } else if (sec === 'reality') {
      h = `<div class="row">${fld('Dest (مقصد استتار)', inp('f-dest', ss.dest || 'www.microsoft.com:443'))}${fld('SNI (serverNames)', inp('f-sni', ss.sni || 'www.microsoft.com'))}</div>
        <div class="row">${fld('Private Key', inp('f-pk', ss.privateKey || ''))}${fld('Public Key', inp('f-pbk', ss.publicKey || ''))}</div>
        <div class="row">${fld('Short ID', inp('f-sid', ss.shortIds || ss.shortId || ''))}${fld('Fingerprint', sel('f-fp', ['chrome', 'firefox', 'safari', 'ios', 'random'], ss.fp || 'chrome'))}</div>
        <button class="btn btn-sm" type="button" onclick="InboundForm.genKeys()">🔑 تولید خودکار کلید REALITY</button>`;
    }
    $('#dyn-sec').innerHTML = h;
  },
  async genKeys() {
    const k = await api('/api/xray/keys');
    $('#f-pk').value = k.privateKey; $('#f-pbk').value = k.publicKey; $('#f-sid').value = k.shortId;
    toast('کلید REALITY تولید شد');
  },
  collectStream(net, sec) {
    const v = (id) => { const e = $(id); return e ? e.value : ''; };
    const ss = {};
    if (net === 'tcp') { ss.headerType = v('#f-header'); if (ss.headerType === 'http') { ss.host = v('#f-host'); ss.path = v('#f-path'); } }
    else if (net === 'ws') { ss.path = v('#f-path'); ss.host = v('#f-host'); }
    else if (net === 'grpc') { ss.serviceName = v('#f-svc'); ss.mode = v('#f-mode'); }
    else if (net === 'kcp') { ss.headerType = v('#f-header'); ss.seed = v('#f-seed'); }
    else if (net === 'httpupgrade' || net === 'xhttp') { ss.path = v('#f-path'); ss.host = v('#f-host'); }
    if (sec === 'tls') { ss.sni = v('#f-sni'); ss.alpn = v('#f-alpn'); ss.certFile = v('#f-cert'); ss.keyFile = v('#f-key'); ss.allowInsecure = $('#f-insecure') && $('#f-insecure').checked; ss.fp = 'chrome'; }
    else if (sec === 'reality') { ss.dest = v('#f-dest'); ss.sni = v('#f-sni'); ss.privateKey = v('#f-pk'); ss.publicKey = v('#f-pbk'); ss.shortIds = v('#f-sid'); ss.fp = v('#f-fp'); }
    return ss;
  },
  async save() {
    const proto = $('#f-proto').value;
    const hasTransport = TRANSPORT_PROTOS.includes(proto);
    const net = hasTransport ? $('#f-net').value : 'tcp';
    const sec = hasTransport ? $('#f-sec').value : 'none';
    const stream = hasTransport ? this.collectStream(net, sec) : {};
    const settings = {};
    if (proto === 'shadowsocks') settings.method = $('#f-method').value;
    if (proto === 'dokodemo-door') { settings.target_addr = $('#f-target-addr').value; settings.target_port = +$('#f-target-port').value; }
    if (proto === 'wireguard') { settings.secretKey = $('#f-wg-secret').value; settings.peers = [{ publicKey: $('#f-wg-peer').value }]; }
    const payload = {
      remark: $('#f-remark').value, port: +$('#f-port').value, protocol: proto,
      listen: $('#f-listen').value, network: net, security: sec,
      stream_settings: stream, settings, enable: 1,
      total: Math.round((+$('#f-total').value || 0) * GB)
    };
    if (this.id) await api(`/api/inbounds/${this.id}`, { method: 'PUT', body: payload });
    else await api('/api/inbounds', { method: 'POST', body: payload });
    Modal.close(); toast(this.id ? 'ویرایش شد' : 'Inbound ساخته شد'); Pages.inbounds();
  }
};

/* ---------- Client form (per protocol) ---------- */
const ClientForm = {
  async open(inboundId, cl) {
    const ibs = await api('/api/inbounds');
    const ib = ibs.inbounds.find(x => x.id === inboundId);
    const proto = ib ? ib.protocol : 'vless';
    cl = cl || { email: '', uuid: '', password: '', flow: '', total_gb: 0, limit_ip: 0, enable: 1, expiry_time: 0 };
    const isEdit = !!cl.id;
    const usesUuid = ['vless', 'vmess', 'trojan'].includes(proto);
    const usesPass = ['trojan', 'shadowsocks', 'socks', 'http'].includes(proto);
    const usesFlow = proto === 'vless';
    Modal.open(isEdit ? 'ویرایش کلاینت' : 'کلاینت جدید', `
      <div class="proto-chip">پروتکل: <b>${proto}</b></div>
      ${fld('نام کلاینت (Email/ID)', inp('c-email', cl.email, 'user1'))}
      <div class="row">
        ${usesUuid ? fld('UUID', `<div class="inline"><input id="c-uuid" value="${esc(cl.uuid)}" placeholder="خالی = خودکار"><button class="btn btn-sm" type="button" onclick="$('#c-uuid').value=crypto.randomUUID();">↻</button></div>`) : '<div></div>'}
        ${usesPass ? fld('Password', inp('c-pass', cl.password, 'خالی = خودکار')) : '<div></div>'}
      </div>
      <div class="row">
        ${fld('حجم (GB، ۰=نامحدود)', inp('c-total', cl.total_gb ? cl.total_gb / GB : 0, '0', 'number'))}
        ${fld('مدت اعتبار (روز، ۰=نامحدود)', inp('c-days', '', '30', 'number'))}
      </div>
      <div class="row">
        ${fld('محدودیت IP (۰=نامحدود)', inp('c-ip', cl.limit_ip, '0', 'number'))}
        ${usesFlow ? fld('Flow', sel('c-flow', FLOWS, cl.flow)) : '<div></div>'}
      </div>
      ${isEdit && cl.expiry_time ? `<div class="hint">انقضای فعلی: ${fmtDate(cl.expiry_time)} — برای تغییر، روز جدید وارد کنید.</div>` : ''}
    `, `<button class="btn btn-primary" id="c-save">${isEdit ? 'ذخیره' : 'ساخت کلاینت'}</button>
        <button class="btn btn-ghost" onclick="Modal.close()">انصراف</button>`);
    $('#c-save').onclick = async () => {
      const days = +$('#c-days').value || 0;
      const payload = {
        email: $('#c-email').value || 'client',
        uuid: ($('#c-uuid') && $('#c-uuid').value) || cl.uuid || '',
        password: ($('#c-pass') && $('#c-pass').value) || '',
        flow: ($('#c-flow') && $('#c-flow').value) || '',
        total_gb: Math.round((+$('#c-total').value || 0) * GB),
        expiry_time: days ? daysFromNow(days) : (isEdit ? cl.expiry_time : 0),
        limit_ip: +$('#c-ip').value || 0, enable: 1
      };
      if (isEdit) await api(`/api/clients/${cl.id}`, { method: 'PUT', body: payload });
      else await api(`/api/inbounds/${inboundId}/clients`, { method: 'POST', body: payload });
      Modal.close(); toast(isEdit ? 'ویرایش شد' : 'کلاینت ساخته شد'); Pages.inbounds();
    };
  }
};

async function showLink(cid) {
  const d = await api(`/api/clients/${cid}/link`);
  const used = d.up + d.down;
  Modal.open('کانفیگ کلاینت', `
    <div class="qr-box"><img src="/api/clients/${cid}/qr?t=${Date.now()}" alt="QR"></div>
    <div class="usage-bar">
      <div><span>مصرف</span><b>${fmtBytes(used)}${d.total ? ' / ' + fmtBytes(d.total) : ' / ∞'}</b></div>
      <div><span>انقضا</span><b>${fmtDate(d.expiry)}</b></div>
    </div>
    <div class="section-title">لینک کانفیگ</div>
    <div class="link-box"><span id="lk">${esc(d.link)}</span></div>
    <div class="section-title">لینک Subscription</div>
    <div class="link-box"><span>${location.origin}${d.sub}</span></div>
  `, `<button class="btn btn-primary" onclick='copyText(${JSON.stringify(d.link)})'>📋 کپی لینک</button>
      <button class="btn" onclick='copyText(${JSON.stringify(location.origin + d.sub)})'>📋 کپی Sub</button>
      <button class="btn btn-ghost" onclick="Modal.close()">بستن</button>`);
}
async function toggleInbound(id) { await api(`/api/inbounds/${id}/toggle`, { method: 'POST' }); toast('تغییر کرد'); }
async function toggleClient(id) { await api(`/api/clients/${id}/toggle`, { method: 'POST' }); toast('تغییر کرد'); Pages.inbounds(); }
async function resetInbound(id) { await api(`/api/inbounds/${id}/reset`, { method: 'POST' }); toast('ریست شد'); Pages.inbounds(); }
async function delInbound(id) { if (!confirm('حذف این Inbound و کلاینت‌هایش؟')) return; await api(`/api/inbounds/${id}`, { method: 'DELETE' }); toast('حذف شد'); Pages.inbounds(); }
async function delClient(id) { if (!confirm('حذف کلاینت؟')) return; await api(`/api/clients/${id}`, { method: 'DELETE' }); toast('حذف شد'); Pages.inbounds(); }

/* ============================ OUTBOUNDS ============================ */
Pages.outbounds = async () => {
  const d = await api('/api/outbounds');
  let rows = d.outbounds.length ? '' :
    `<tr><td colspan="6"><div class="empty"><div class="big">⇲</div>هیچ Outbound تعریف نشده</div></td></tr>`;
  d.outbounds.forEach(o => {
    rows += `<tr><td><b>${esc(o.tag)}</b></td><td><span class="badge badge-proto">${o.protocol}</span></td>
      <td>${esc(o.address) || '-'}${o.port ? ':' + o.port : ''}</td><td>${fmtBytes(o.up + o.down)}</td>
      <td><span class="badge ${o.enable ? 'badge-on' : 'badge-off'}">${o.enable ? 'فعال' : 'غیرفعال'}</span></td>
      <td class="actions"><button class="btn btn-sm" onclick="resetOutbound(${o.id})">↺</button>
        <button class="btn btn-sm btn-danger" onclick="delOutbound(${o.id})">✕</button></td></tr>`;
  });
  $('#content').innerHTML = `
    <div class="panel"><div class="panel-head"><h3>Outbounds (پروکسی خروجی / زنجیره)</h3>
      <button class="btn btn-primary" onclick="OutboundForm.open()">+ Outbound جدید</button></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Tag</th><th>پروتکل</th><th>آدرس</th><th>ترافیک</th><th>وضعیت</th><th>عملیات</th></tr></thead>
        <tbody>${rows}</tbody></table></div></div>
    <div class="banner info">با ساخت Outbound از نوع <b>http/socks/vless/vmess/trojan</b> و وارد کردن IP/پورت یک سرور یا کانفیگ دیگر،
      ترافیک از آن گرفته می‌شود. سپس در «مسیریابی» تعیین کنید کدام ترافیک به این Outbound برود.</div>`;
};

const OutboundForm = {
  open() {
    Modal.open('Outbound جدید', `
      <div class="row">${fld('Tag (شناسه)', inp('o-tag', '', 'proxy-out'))}${fld('پروتکل', sel('o-proto', ['freedom', 'blackhole', 'http', 'socks', 'vless', 'vmess', 'trojan', 'wireguard'], 'http'))}</div>
      <div id="dyn-out"></div>
    `, `<button class="btn btn-primary" id="o-save">ساخت</button>
        <button class="btn btn-ghost" onclick="Modal.close()">انصراف</button>`, true);
    $('#o-proto').onchange = this.render;
    this.render();
    $('#o-save').onclick = async () => {
      const v = (id) => { const e = $(id); return e ? e.value : ''; };
      await api('/api/outbounds', { method: 'POST', body: {
        tag: v('#o-tag') || 'proxy', protocol: v('#o-proto'),
        address: v('#o-addr'), port: +v('#o-port') || 0,
        user: v('#o-user'), pass: v('#o-pass'), uuid: v('#o-uuid'),
        secretKey: v('#o-secret'), peerKey: v('#o-peer'),
        security: v('#o-sec') || 'none', sni: v('#o-sni'), send_through: v('#o-st')
      }});
      Modal.close(); toast('Outbound ساخته شد'); Pages.outbounds();
    };
  },
  render() {
    const p = $('#o-proto').value;
    let h = '';
    if (p === 'freedom') h = `<div class="banner info">freedom = اتصال مستقیم. فقط SendThrough می‌توانید تعیین کنید.</div>` + fld('SendThrough IP (اختیاری)', inp('o-st', '', 'آدرس IP محلی'));
    else if (p === 'blackhole') h = `<div class="banner info">blackhole = مسدودسازی ترافیک (برای قوانین مسیریابی).</div>`;
    else if (p === 'http' || p === 'socks') h = `<div class="row">${fld('آدرس / IP', inp('o-addr', '', '1.2.3.4'))}${fld('پورت', inp('o-port', '', '8080', 'number'))}</div>
      <div class="row">${fld('Username (اختیاری)', inp('o-user'))}${fld('Password (اختیاری)', inp('o-pass'))}</div>`;
    else if (p === 'vless' || p === 'vmess') h = `<div class="row">${fld('آدرس', inp('o-addr', '', 'server.com'))}${fld('پورت', inp('o-port', '', '443', 'number'))}</div>
      ${fld('UUID', inp('o-uuid'))}
      <div class="row">${fld('امنیت', sel('o-sec', ['none', 'tls'], 'tls'))}${fld('SNI', inp('o-sni'))}</div>`;
    else if (p === 'trojan') h = `<div class="row">${fld('آدرس', inp('o-addr'))}${fld('پورت', inp('o-port', '', '443', 'number'))}</div>
      ${fld('Password', inp('o-pass'))}<div class="row">${fld('امنیت', sel('o-sec', ['tls'], 'tls'))}${fld('SNI', inp('o-sni'))}</div>`;
    else if (p === 'wireguard') h = `<div class="row">${fld('آدرس Endpoint', inp('o-addr'))}${fld('پورت', inp('o-port', '', '51820', 'number'))}</div>
      <div class="row">${fld('Secret Key', inp('o-secret'))}${fld('Peer PublicKey', inp('o-peer'))}</div>`;
    $('#dyn-out').innerHTML = h;
  }
};
async function resetOutbound(id) { await api(`/api/outbounds/${id}/reset`, { method: 'POST' }); toast('ریست شد'); Pages.outbounds(); }
async function delOutbound(id) { if (!confirm('حذف Outbound؟')) return; await api(`/api/outbounds/${id}`, { method: 'DELETE' }); toast('حذف شد'); Pages.outbounds(); }

/* ============================ ROUTING ============================ */
Pages.routing = async () => {
  const [d, ob] = await Promise.all([api('/api/routing'), api('/api/outbounds')]);
  window._tags = ['direct', 'blocked', ...ob.outbounds.map(o => o.tag)];
  let rows = d.rules.length ? '' : `<tr><td colspan="6"><div class="empty"><div class="big">⤳</div>قانونی تعریف نشده</div></td></tr>`;
  d.rules.forEach(r => rows += `<tr><td><b>${esc(r.name)}</b></td><td>${esc(r.domain) || '-'}</td><td>${esc(r.ip) || '-'}</td><td>${esc(r.port) || '-'}</td>
    <td><span class="badge badge-proto">${esc(r.outbound_tag)}</span></td>
    <td class="actions"><button class="btn btn-sm btn-danger" onclick="delRule(${r.id})">✕</button></td></tr>`);
  $('#content').innerHTML = `<div class="panel"><div class="panel-head"><h3>قوانین مسیریابی</h3>
    <button class="btn btn-primary" onclick="RuleForm.open()">+ قانون</button></div>
    <div class="table-wrap"><table><thead><tr><th>نام</th><th>دامنه</th><th>IP</th><th>پورت</th><th>Outbound</th><th>عملیات</th></tr></thead>
    <tbody>${rows}</tbody></table></div></div>`;
};
const RuleForm = {
  open() {
    Modal.open('قانون مسیریابی', `
      ${fld('نام', inp('r-name', '', 'route-ir'))}
      ${fld('دامنه‌ها (با کاما)', inp('r-domain', '', 'geosite:ir,example.com'))}
      ${fld('IP ها (با کاما)', inp('r-ip', '', 'geoip:ir,1.2.3.4'))}
      <div class="row">${fld('پورت', inp('r-port', '', '443'))}${fld('Outbound مقصد', sel('r-out', window._tags || ['direct'], 'direct'))}</div>
    `, `<button class="btn btn-primary" id="r-save">ساخت</button><button class="btn btn-ghost" onclick="Modal.close()">انصراف</button>`);
    $('#r-save').onclick = async () => {
      await api('/api/routing', { method: 'POST', body: {
        name: $('#r-name').value || 'rule', domain: $('#r-domain').value,
        ip: $('#r-ip').value, port: $('#r-port').value, outbound_tag: $('#r-out').value } });
      Modal.close(); toast('قانون اضافه شد'); Pages.routing();
    };
  }
};
async function delRule(id) { await api(`/api/routing/${id}`, { method: 'DELETE' }); toast('حذف شد'); Pages.routing(); }

/* ============================ NODES ============================ */
Pages.nodes = async () => {
  const d = await api('/api/nodes');
  let rows = d.nodes.length ? '' : `<tr><td colspan="4"><div class="empty"><div class="big">⬢</div>نودی اضافه نشده</div></td></tr>`;
  d.nodes.forEach(n => rows += `<tr><td><b>${esc(n.name)}</b></td><td>${esc(n.address)}:${n.api_port}</td>
    <td><span class="badge ${n.status === 'online' ? 'badge-on' : 'badge-off'}">${n.status}</span></td>
    <td class="actions"><button class="btn btn-sm btn-danger" onclick="delNode(${n.id})">✕</button></td></tr>`);
  $('#content').innerHTML = `<div class="panel"><div class="panel-head"><h3>نودها (چند سرور)</h3>
    <button class="btn btn-primary" onclick="NodeForm.open()">+ نود</button></div>
    <div class="table-wrap"><table><thead><tr><th>نام</th><th>آدرس</th><th>وضعیت</th><th>عملیات</th></tr></thead>
    <tbody>${rows}</tbody></table></div></div>`;
};
const NodeForm = {
  open() {
    Modal.open('نود جدید', `${fld('نام نود', inp('n-name', '', 'Germany-1'))}
      <div class="row">${fld('آدرس', inp('n-addr', '', 'de.example.com'))}${fld('پورت API', inp('n-port', '62050', '', 'number'))}</div>`,
      `<button class="btn btn-primary" id="n-save">افزودن</button><button class="btn btn-ghost" onclick="Modal.close()">انصراف</button>`);
    $('#n-save').onclick = async () => {
      await api('/api/nodes', { method: 'POST', body: { name: $('#n-name').value, address: $('#n-addr').value, api_port: +$('#n-port').value } });
      Modal.close(); toast('نود اضافه شد'); Pages.nodes();
    };
  }
};
async function delNode(id) { await api(`/api/nodes/${id}`, { method: 'DELETE' }); toast('حذف شد'); Pages.nodes(); }

/* ============================ XRAY ============================ */
Pages.xray = async () => {
  const [st, cfg] = await Promise.all([api('/api/xray/status'), api('/api/xray/config')]);
  $('#content').innerHTML = `
    <div class="panel"><div class="panel-head"><h3>مدیریت هسته Xray</h3></div>
      <div class="pad">
        <div class="kv"><span>وضعیت</span><span class="badge ${st.running ? 'badge-on' : 'badge-off'}">${st.running ? 'فعال' : 'متوقف'}</span></div>
        <div class="kv"><span>نصب‌شده</span><b>${st.installed ? 'بله' : 'خیر'}</b></div>
        <div class="kv"><span>نسخه</span><b>${esc(st.version)}</b></div>
        <div class="kv"><span>پورت API</span><b>${st.api_port}</b></div>
        <div class="row-btns" style="margin-top:14px">
          ${st.installed ? '' : '<button class="btn btn-primary" onclick="installXray()">⬇ نصب Xray</button>'}
          <button class="btn btn-primary" onclick="xrayAction('restart')">↻ ری‌استارت</button>
          <button class="btn" onclick="xrayAction('start')">▶ شروع</button>
          <button class="btn" onclick="xrayAction('stop')">⏹ توقف</button>
          <button class="btn btn-ghost" onclick="xrayAction('test')">✓ تست کانفیگ</button>
        </div></div></div>
    <div class="panel"><div class="panel-head"><h3>config.json تولیدشده (واقعی)</h3>
      <button class="btn btn-sm" onclick="copyText(document.getElementById('cfgv').textContent)">📋 کپی</button></div>
      <div class="pad"><div class="code-view" id="cfgv">${esc(JSON.stringify(cfg.config, null, 2))}</div></div></div>`;
  updateXrayPill(st.running ? 'running' : 'stopped');
};
async function xrayAction(a) {
  toast('در حال اجرا…');
  const d = await api(`/api/xray/${a}`, { method: 'POST' });
  toast(d.ok ? (a === 'test' ? 'کانفیگ معتبر است ✓' : `${a}: موفق`) : ('خطا: ' + (d.message || '')), d.ok ? 'ok' : 'err');
  updateXrayPill(d.running ? 'running' : 'stopped');
}
function updateXrayPill(status) {
  const p = $('#xrayPill'); if (!p) return;
  p.classList.toggle('stopped', status !== 'running');
  p.innerHTML = `<span class="dot"></span> Xray ${status === 'running' ? 'فعال' : 'متوقف'}`;
}

/* ============================ LOGS ============================ */
Pages.logs = async () => {
  const d = await api('/api/logs');
  const rows = d.logs.map(l => `<tr><td>${new Date(l.created_at * 1000).toLocaleString('fa-IR')}</td>
    <td><span class="badge ${l.level === 'error' ? 'badge-off' : l.level === 'warning' ? 'badge-warn' : 'badge-net'}">${l.level}</span></td><td>${esc(l.message)}</td></tr>`).join('')
    || `<tr><td colspan="3"><div class="empty"><div class="big">≡</div>لاگی موجود نیست</div></td></tr>`;
  $('#content').innerHTML = `<div class="panel"><div class="panel-head"><h3>لاگ سیستم</h3>
    <button class="btn btn-sm" onclick="Pages.logs()">↻ تازه‌سازی</button></div>
    <div class="table-wrap"><table><thead><tr><th>زمان</th><th>سطح</th><th>پیام</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
};

/* ============================ SETTINGS ============================ */
Pages.settings = async () => {
  const s = (await api('/api/settings')).settings;
  $('#content').innerHTML = `
    <div class="panel"><div class="panel-head"><h3>تنظیمات پنل</h3></div><div class="pad">
      <div class="row">${fld('عنوان پنل', inp('s-title', s.panel_title))}
        ${fld('زبان', sel('s-lang', ['fa','en','ar','ru','zh','tr','de','es','vi','id','ja','ko','pt'], s.lang))}</div>
      <div class="row">${fld('پورت Subscription', inp('s-subport', s.sub_port))}${fld('مسیر Subscription', inp('s-subpath', s.sub_path))}</div>
      <button class="btn btn-primary" onclick="saveSettings()">ذخیره</button></div></div>
    <div class="panel"><div class="panel-head"><h3>ربات تلگرام</h3></div><div class="pad">
      <div class="row">${fld('Bot Token', inp('s-tgtoken', s.tg_token, '123:ABC'))}${fld('Admin Chat ID', inp('s-tgchat', s.tg_chat))}</div>
      <button class="btn btn-primary" onclick="saveTelegram()">ذخیره ربات</button></div></div>
    <div class="panel"><div class="panel-head"><h3>تغییر اطلاعات حساب</h3></div><div class="pad">
      <div class="row">${fld('نام کاربری جدید', inp('s-user', window.PANEL_USER))}${fld('رمز جدید (خالی=بدون تغییر)', inp('s-pass', '', '••••••', 'password'))}</div>
      <button class="btn btn-primary" onclick="saveAccount()">بروزرسانی حساب</button></div></div>
    <div class="panel"><div class="panel-head"><h3>REST API</h3></div><div class="pad hint">
      تمام عملیات از طریق REST API با پیشوند <b>/api/</b> در دسترس است.
      نمونه: <code>GET /api/inbounds</code> · <code>POST /api/xray/restart</code> · <code>GET /api/xray/keys</code></div></div>`;
};
async function saveSettings() {
  await api('/api/settings', { method: 'POST', body: { panel_title: $('#s-title').value, lang: $('#s-lang').value, sub_port: $('#s-subport').value, sub_path: $('#s-subpath').value } });
  toast('ذخیره شد');
}
async function saveTelegram() { await api('/api/settings', { method: 'POST', body: { tg_token: $('#s-tgtoken').value, tg_chat: $('#s-tgchat').value } }); toast('ذخیره شد'); }
async function saveAccount() {
  const d = await api('/api/account', { method: 'POST', body: { username: $('#s-user').value, password: $('#s-pass').value } });
  if (d.ok) { window.PANEL_USER = $('#s-user').value; toast('حساب بروزرسانی شد'); $('#s-pass').value = ''; }
  else toast(d.error || 'خطا', 'err');
}

/* ---------- live refresh on overview ---------- */
setInterval(() => { if ($('.nav-item.active')?.dataset.page === 'overview') Pages.overview(); }, 15000);

/* ---------- boot ---------- */
Pages.overview();
