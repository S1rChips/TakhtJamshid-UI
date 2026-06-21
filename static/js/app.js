/* ===== TakhtJamshid Panel — front-end controller (real Xray + i18n) ===== */
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
const GB = 1073741824;
const fmtBytes = (b) => {
  b = +b || 0; if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  return (b / Math.pow(1024, i)).toFixed(i ? 2 : 0) + ' ' + u[i];
};
const fmtDate = (ms) => ms ? new Date(ms).toLocaleDateString(LANG === 'fa' ? 'fa-IR' : LANG) : '∞';
const daysFromNow = (d) => d ? Date.now() + d * 86400000 : 0;
const esc = (s) => (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const toast = (msg, type = 'ok') => {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${type === 'err' ? '✕' : '✓'}</span><span>${msg}</span>`;
  $('#toastWrap').appendChild(el);
  setTimeout(() => { el.style.opacity = 0; setTimeout(() => el.remove(), 300); }, 3200);
};
const copyText = (txt) => { navigator.clipboard.writeText(txt); toast(t('copied')); };

const PROTOCOLS = ['vless', 'vmess', 'trojan', 'shadowsocks', 'socks', 'http', 'dokodemo-door', 'wireguard'];
const NETWORKS = ['tcp', 'kcp', 'ws', 'grpc', 'httpupgrade', 'xhttp'];
const SECURITY = ['none', 'tls', 'reality'];
const SS_METHODS = ['chacha20-ietf-poly1305', 'aes-256-gcm', 'aes-128-gcm', '2022-blake3-aes-256-gcm'];
const FLOWS = ['', 'xtls-rprx-vision'];
const TRANSPORT_PROTOS = ['vless', 'vmess', 'trojan', 'shadowsocks'];
const PAGE_KEY = { overview: 'nav_overview', inbounds: 'nav_inbounds', outbounds: 'nav_outbounds', routing: 'nav_routing', nodes: 'nav_nodes', xray: 'nav_xray', logs: 'nav_logs', settings: 'nav_settings' };

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
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') Modal.close(); });

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

/* ---------- Language switcher ---------- */
function buildLangMenu() {
  const menu = $('#langMenu');
  if (!menu) return;
  menu.innerHTML = langList().map(l =>
    `<button class="lang-opt ${l.code === LANG ? 'active' : ''}" data-lang="${l.code}">${l.name}</button>`).join('');
  $$('.lang-opt', menu).forEach(b => b.onclick = () => {
    applyLang(b.dataset.lang);
    api('/api/settings', { method: 'POST', body: { lang: b.dataset.lang } });
    menu.classList.remove('open');
    buildLangMenu();
    onLangChange();
  });
}
$('#langToggle').onclick = (e) => { e.stopPropagation(); $('#langMenu').classList.toggle('open'); };
document.addEventListener('click', () => $('#langMenu')?.classList.remove('open'));

function onLangChange() {
  applyLang(LANG);
  const active = $('.nav-item.active');
  if (active) {
    $('#pageTitle').textContent = t(PAGE_KEY[active.dataset.page]);
    Pages[active.dataset.page]();
  }
}

/* ---------- Nav ---------- */
$('#menuToggle').onclick = () => $('#sidebar').classList.toggle('open');
$$('.nav-item').forEach(item => item.onclick = () => {
  $$('.nav-item').forEach(n => n.classList.remove('active'));
  item.classList.add('active');
  $('#pageTitle').textContent = t(PAGE_KEY[item.dataset.page]);
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
  const banner = d.xray_installed ? '' : `
    <div class="banner warn">
      <div>⚠ ${t('xray_not_installed')}</div>
      <button class="btn btn-primary btn-sm" onclick="installXray()">⬇ ${t('auto_install')}</button>
    </div>`;
  $('#content').innerHTML = `
    ${banner}
    <div class="stat-grid">
      ${card('⇄', t('stat_inbounds'), d.inbounds, t('ports_active'))}
      ${card('👥', t('stat_clients'), d.clients, `${d.active_clients} ${t('active_clients')}`)}
      ${card('🟢', t('stat_online'), d.online, t('connected_now'))}
      ${card('⬢', t('stat_nodes'), d.nodes, t('servers'))}
      ${card('⬆', t('stat_upload'), fmtBytes(d.up))}
      ${card('⬇', t('stat_download'), fmtBytes(d.down))}
      ${card('Σ', t('stat_total'), fmtBytes(d.total))}
      ${card('⚙', t('stat_core'), d.xray_status === 'running' ? t('running') : t('stopped'), d.xray_version, d.xray_status === 'running' ? 'good' : 'bad')}
    </div>
    <div class="panel"><div class="panel-head"><h3>${t('quick_core')}</h3></div>
      <div class="pad row-btns">
        <button class="btn btn-primary" onclick="xrayAction('restart')">↻ ${t('restart')}</button>
        <button class="btn" onclick="xrayAction('start')">▶ ${t('start')}</button>
        <button class="btn" onclick="xrayAction('stop')">⏹ ${t('stop')}</button>
        <button class="btn btn-ghost" onclick="xrayAction('test')">✓ ${t('test_config')}</button>
        <button class="btn btn-ghost" onclick="document.querySelector('[data-page=xray]').click()">config.json</button>
      </div></div>`;
  updateXrayPill(d.xray_status);
};

async function installXray() {
  toast(t('downloading'));
  const d = await api('/api/xray/install', { method: 'POST' });
  toast(d.ok ? t('installed_ok') : (t('error') + ': ' + d.message), d.ok ? 'ok' : 'err');
  Pages.overview();
}

/* ============================ INBOUNDS ============================ */
Pages.inbounds = async () => {
  const d = await api('/api/inbounds');
  let rows = d.inbounds.length ? '' :
    `<tr><td colspan="8"><div class="empty"><div class="big">⇄</div>${t('no_inbounds')}</div></td></tr>`;
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
        <button class="btn btn-sm btn-primary" onclick="ClientForm.open(${ib.id})">${t('add_client')}</button>
        <button class="btn btn-sm" onclick="InboundForm.open(${ib.id})" title="${t('edit')}">✎</button>
        <button class="btn btn-sm" onclick="resetInbound(${ib.id})" title="${t('reset')}">↺</button>
        <button class="btn btn-sm btn-danger" onclick="delInbound(${ib.id})" title="${t('delete')}">✕</button>
      </td></tr>
      <tbody class="client-body" id="cb-${ib.id}" style="display:none">
        ${ib.clients.map(cl => clientRow(cl, ib)).join('') ||
          `<tr class="client-row"><td colspan="8" style="color:var(--text-dim)">${t('no_clients')}</td></tr>`}
      </tbody>`;
  });
  $('#content').innerHTML = `
    <div class="panel"><div class="panel-head"><h3>${t('inbounds_list')}</h3>
      <button class="btn btn-primary" onclick="InboundForm.open()">+ ${t('new_inbound')}</button></div>
      <div class="table-wrap"><table>
        <thead><tr><th></th><th>${t('name')}</th><th>${t('protocol')}</th><th>${t('port')}</th><th>${t('clients')}</th><th>${t('traffic')}</th><th>${t('enable')}</th><th>${t('actions')}</th></tr></thead>
        <tbody>${rows}</tbody></table></div></div>`;
  $$('.expand-btn').forEach(b => b.onclick = () => {
    const body = $(`#cb-${b.dataset.ib}`), show = body.style.display === 'none';
    body.style.display = show ? '' : 'none'; b.classList.toggle('open', show);
  });
};

function clientRow(cl, ib) {
  const used = cl.up + cl.down, pct = cl.total_gb ? Math.min(100, used / cl.total_gb * 100) : 0;
  const expired = cl.expiry_time && cl.expiry_time < Date.now();
  const mult = (cl.multiplier && cl.multiplier !== 1) ? ` <span class="badge badge-mult">${cl.multiplier}×</span>` : '';
  return `<tr class="client-row">
    <td><span class="online-dot ${cl.online ? '' : 'off'}" title="${cl.online ? t('online') : t('offline')}"></span></td>
    <td colspan="2"><b>${esc(cl.email)}</b>${mult}${cl.enable ? '' : ` <span class="badge badge-off">${t('inactive')}</span>`}</td>
    <td>${fmtBytes(used)}${cl.total_gb ? ' / ' + fmtBytes(cl.total_gb) : ''}<div class="progress"><span style="width:${pct}%"></span></div></td>
    <td>${expired ? `<span class="badge badge-off">${t('expired')}</span>` : fmtDate(cl.expiry_time)}</td>
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
  `<select id="${id}">${arr.map(o => `<option ${o === val ? 'selected' : ''} value="${o}">${o || ('— ' + t('none') + ' —')}</option>`).join('')}</select>`;

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
    Modal.open(id ? t('edit') : t('new_inbound'), `
      <div class="row">
        ${fld(t('remark'), inp('f-remark', ib.remark, 'my-inbound'))}
        ${fld(t('port'), inp('f-port', ib.port, '443', 'number'))}
      </div>
      <div class="row">
        ${fld(t('protocol'), sel('f-proto', PROTOCOLS, ib.protocol))}
        ${fld(t('listen_ip'), inp('f-listen', ib.listen, '0.0.0.0'))}
      </div>
      <div id="dyn-inbound"></div>
      ${fld(t('total_limit'), inp('f-total', ib.total ? ib.total / GB : 0, '0', 'number'))}
    `, `<button class="btn btn-primary" id="ib-save">${id ? t('save') : t('create')}</button>
        <button class="btn btn-ghost" onclick="Modal.close()">${t('cancel')}</button>`, true);
    $('#f-proto').onchange = () => this.render();
    this.render();
    $('#ib-save').onclick = () => this.save();
  },
  render() {
    const ib = this.data, proto = $('#f-proto').value, set = ib.settings || {};
    const hasTransport = TRANSPORT_PROTOS.includes(proto);
    let html = '';
    if (hasTransport) {
      html += `<div class="row">
        ${fld(t('network'), sel('f-net', NETWORKS, ib.network))}
        ${fld(t('security'), sel('f-sec', SECURITY, ib.security || 'none'))}
      </div><div id="dyn-net"></div><div id="dyn-sec"></div>`;
    }
    if (proto === 'shadowsocks')
      html += `<div class="row">${fld(t('ss_method'), sel('f-method', SS_METHODS, set.method || SS_METHODS[0]))}<div></div></div>`;
    if (proto === 'socks' || proto === 'http')
      html = `<div class="banner info">${t('socks_http_hint')}</div>` + html;
    if (proto === 'dokodemo-door')
      html += `<div class="row">${fld(t('target_addr'), inp('f-target-addr', set.target_addr || '127.0.0.1'))}${fld(t('target_port'), inp('f-target-port', set.target_port || 0, '0', 'number'))}</div>`;
    if (proto === 'wireguard')
      html += `<div class="row">${fld(t('secret_key'), inp('f-wg-secret', set.secretKey || ''))}${fld(t('peer_pubkey'), inp('f-wg-peer', (set.peers && set.peers[0] && set.peers[0].publicKey) || ''))}</div>`;
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
    if (net === 'tcp') h = `<div class="row">${fld(t('header_type'), sel('f-header', ['none', 'http'], ss.headerType || 'none'))}${fld(t('host'), inp('f-host', ss.host || ''))}</div>` + fld(t('path'), inp('f-path', ss.path || '/'));
    else if (net === 'ws') h = `<div class="row">${fld(t('path'), inp('f-path', ss.path || '/'))}${fld(t('host'), inp('f-host', ss.host || ''))}</div>`;
    else if (net === 'grpc') h = `<div class="row">${fld(t('service_name'), inp('f-svc', ss.serviceName || ''))}${fld(t('mode'), sel('f-mode', ['gun', 'multi'], ss.mode || 'gun'))}</div>`;
    else if (net === 'kcp') h = `<div class="row">${fld(t('header_type'), sel('f-header', ['none', 'srtp', 'utp', 'wechat-video', 'dtls', 'wireguard'], ss.headerType || 'none'))}${fld(t('seed'), inp('f-seed', ss.seed || ''))}</div>`;
    else if (net === 'httpupgrade' || net === 'xhttp') h = `<div class="row">${fld(t('path'), inp('f-path', ss.path || '/'))}${fld(t('host'), inp('f-host', ss.host || ''))}</div>`;
    $('#dyn-net').innerHTML = h;
  },
  renderSec() {
    const ss = this.data.stream_settings || {}, sec = $('#f-sec').value;
    let h = '';
    if (sec === 'tls') {
      h = `<div class="row">${fld(t('sni'), inp('f-sni', ss.sni || ''))}${fld(t('alpn'), inp('f-alpn', ss.alpn || 'h2,http/1.1'))}</div>
        <div class="row">${fld(t('cert_file'), inp('f-cert', ss.certFile || '', '/path/fullchain.pem'))}${fld(t('key_file'), inp('f-key', ss.keyFile || '', '/path/privkey.pem'))}</div>
        <div class="switch-line"><span>${t('allow_insecure')}</span><label class="switch"><input type="checkbox" id="f-insecure" ${ss.allowInsecure ? 'checked' : ''}><span></span></label></div>`;
    } else if (sec === 'reality') {
      h = `<div class="row">${fld(t('dest'), inp('f-dest', ss.dest || 'www.microsoft.com:443'))}${fld(t('server_names'), inp('f-sni', ss.sni || 'www.microsoft.com'))}</div>
        <div class="row">${fld(t('private_key'), inp('f-pk', ss.privateKey || ''))}${fld(t('public_key'), inp('f-pbk', ss.publicKey || ''))}</div>
        <div class="row">${fld(t('short_id'), inp('f-sid', ss.shortIds || ss.shortId || ''))}${fld(t('fingerprint'), sel('f-fp', ['chrome', 'firefox', 'safari', 'ios', 'random'], ss.fp || 'chrome'))}</div>
        <button class="btn btn-sm" type="button" onclick="InboundForm.genKeys()">🔑 ${t('gen_reality')}</button>`;
    }
    $('#dyn-sec').innerHTML = h;
  },
  async genKeys() {
    const k = await api('/api/xray/keys');
    $('#f-pk').value = k.privateKey; $('#f-pbk').value = k.publicKey; $('#f-sid').value = k.shortId;
    toast(t('reality_done'));
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
    const proto = $('#f-proto').value, hasTransport = TRANSPORT_PROTOS.includes(proto);
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
    Modal.close(); toast(t('saved')); Pages.inbounds();
  }
};

/* ---------- Client form (dynamic per protocol + multiplier) ---------- */
const ClientForm = {
  async open(inboundId, cl) {
    const ibs = await api('/api/inbounds');
    const ib = ibs.inbounds.find(x => x.id === inboundId);
    const proto = ib ? ib.protocol : 'vless';
    cl = cl || { email: '', uuid: '', password: '', flow: '', total_gb: 0, limit_ip: 0, enable: 1, expiry_time: 0, multiplier: 1, comment: '' };
    const isEdit = !!cl.id;
    const usesUuid = ['vless', 'vmess', 'trojan'].includes(proto);
    const usesPass = ['trojan', 'shadowsocks', 'socks', 'http'].includes(proto);
    const usesFlow = proto === 'vless';
    const multOn = cl.multiplier && cl.multiplier !== 1;
    Modal.open(isEdit ? t('edit_client') : t('new_client'), `
      <div class="proto-chip">${t('protocol')}: <b>${proto}</b></div>
      ${fld(t('client_name'), inp('c-email', cl.email, 'user1'))}
      <div class="row">
        ${usesUuid ? fld(t('uuid'), `<div class="inline"><input id="c-uuid" value="${esc(cl.uuid)}" placeholder="${t('auto')}"><button class="btn btn-sm" type="button" onclick="$('#c-uuid').value=crypto.randomUUID();">↻</button></div>`) : '<div></div>'}
        ${usesPass ? fld(t('password'), inp('c-pass', cl.password, t('auto'))) : '<div></div>'}
      </div>
      <div class="row">
        ${fld(t('volume'), inp('c-total', cl.total_gb ? cl.total_gb / GB : 0, '0', 'number'))}
        ${fld(t('duration'), inp('c-days', '', '30', 'number'))}
      </div>
      <div class="row">
        ${fld(t('ip_limit'), inp('c-ip', cl.limit_ip, '0', 'number'))}
        ${usesFlow ? fld(t('flow'), sel('c-flow', FLOWS, cl.flow)) : '<div></div>'}
      </div>
      <div class="mult-box">
        <div class="switch-line"><span>${t('enable_multiplier')}</span>
          <label class="switch"><input type="checkbox" id="c-mult-on" ${multOn ? 'checked' : ''}><span></span></label></div>
        <div id="c-mult-wrap" style="${multOn ? '' : 'display:none'}">
          ${fld(t('multiplier'), inp('c-mult', multOn ? cl.multiplier : 2, '2', 'number'), t('multiplier_hint'))}
        </div>
      </div>
      ${fld(t('comment'), inp('c-comment', cl.comment || ''))}
      ${isEdit && cl.expiry_time ? `<div class="hint">${t('current_expiry')}: ${fmtDate(cl.expiry_time)}</div>` : ''}
    `, `<button class="btn btn-primary" id="c-save">${isEdit ? t('save') : t('create')}</button>
        <button class="btn btn-ghost" onclick="Modal.close()">${t('cancel')}</button>`);
    $('#c-mult-on').onchange = (e) => $('#c-mult-wrap').style.display = e.target.checked ? '' : 'none';
    $('#c-save').onclick = async () => {
      const days = +$('#c-days').value || 0;
      const multOn2 = $('#c-mult-on').checked;
      const payload = {
        email: $('#c-email').value || 'client',
        uuid: ($('#c-uuid') && $('#c-uuid').value) || cl.uuid || '',
        password: ($('#c-pass') && $('#c-pass').value) || '',
        flow: ($('#c-flow') && $('#c-flow').value) || '',
        total_gb: Math.round((+$('#c-total').value || 0) * GB),
        expiry_time: days ? daysFromNow(days) : (isEdit ? cl.expiry_time : 0),
        limit_ip: +$('#c-ip').value || 0,
        multiplier: multOn2 ? (+$('#c-mult').value || 1) : 1,
        comment: $('#c-comment').value, enable: 1
      };
      if (isEdit) await api(`/api/clients/${cl.id}`, { method: 'PUT', body: payload });
      else await api(`/api/inbounds/${inboundId}/clients`, { method: 'POST', body: payload });
      Modal.close(); toast(t('saved')); Pages.inbounds();
    };
  }
};

async function showLink(cid) {
  const d = await api(`/api/clients/${cid}/link`);
  const used = d.up + d.down;
  const multBadge = (d.multiplier && d.multiplier !== 1) ? ` <span class="badge badge-mult">${d.multiplier}×</span>` : '';
  Modal.open(t('client_config'), `
    <div class="qr-box"><img src="/api/clients/${cid}/qr?t=${Date.now()}" alt="QR"></div>
    <div class="usage-bar">
      <div><span>${t('usage')}</span><b>${fmtBytes(used)}${d.total ? ' / ' + fmtBytes(d.total) : ' / ∞'}${multBadge}</b></div>
      <div><span>${t('expiry')}</span><b>${fmtDate(d.expiry)}</b></div>
    </div>
    <div class="section-title">${t('config_link')}</div>
    <div class="link-box"><span id="lk">${esc(d.link)}</span></div>
    <div class="section-title">${t('sub_link')}</div>
    <div class="link-box"><span>${location.origin}${d.sub}</span></div>
  `, `<button class="btn btn-primary" onclick='copyText(${JSON.stringify(d.link)})'>📋 ${t('copy_link')}</button>
      <button class="btn" onclick='copyText(${JSON.stringify(location.origin + d.sub)})'>📋 ${t('copy_sub')}</button>
      <button class="btn btn-ghost" onclick='window.open(${JSON.stringify(d.info)})'>↗ ${t('open_page')}</button>`);
}
async function toggleInbound(id) { await api(`/api/inbounds/${id}/toggle`, { method: 'POST' }); toast(t('changed')); }
async function toggleClient(id) { await api(`/api/clients/${id}/toggle`, { method: 'POST' }); toast(t('changed')); Pages.inbounds(); }
async function resetInbound(id) { await api(`/api/inbounds/${id}/reset`, { method: 'POST' }); toast(t('done')); Pages.inbounds(); }
async function delInbound(id) { if (!confirm(t('confirm_del_inbound'))) return; await api(`/api/inbounds/${id}`, { method: 'DELETE' }); toast(t('deleted')); Pages.inbounds(); }
async function delClient(id) { if (!confirm(t('confirm_del_client'))) return; await api(`/api/clients/${id}`, { method: 'DELETE' }); toast(t('deleted')); Pages.inbounds(); }

/* ============================ OUTBOUNDS ============================ */
Pages.outbounds = async () => {
  const d = await api('/api/outbounds');
  let rows = d.outbounds.length ? '' :
    `<tr><td colspan="6"><div class="empty"><div class="big">⇲</div>${t('no_outbounds')}</div></td></tr>`;
  d.outbounds.forEach(o => {
    rows += `<tr><td><b>${esc(o.tag)}</b></td><td><span class="badge badge-proto">${o.protocol}</span></td>
      <td>${esc(o.address) || '-'}${o.port ? ':' + o.port : ''}</td><td>${fmtBytes(o.up + o.down)}</td>
      <td><span class="badge ${o.enable ? 'badge-on' : 'badge-off'}">${o.enable ? t('active') : t('inactive')}</span></td>
      <td class="actions"><button class="btn btn-sm" onclick="resetOutbound(${o.id})">↺</button>
        <button class="btn btn-sm btn-danger" onclick="delOutbound(${o.id})">✕</button></td></tr>`;
  });
  $('#content').innerHTML = `
    <div class="panel"><div class="panel-head"><h3>${t('outbounds_title')}</h3>
      <button class="btn btn-primary" onclick="OutboundForm.open()">+ ${t('new_outbound')}</button></div>
      <div class="table-wrap"><table>
        <thead><tr><th>${t('tag')}</th><th>${t('protocol')}</th><th>${t('address')}</th><th>${t('traffic')}</th><th>${t('status')}</th><th>${t('actions')}</th></tr></thead>
        <tbody>${rows}</tbody></table></div></div>
    <div class="banner info">${t('outbound_hint')}</div>`;
};

const OutboundForm = {
  open() {
    Modal.open(t('new_outbound'), `
      <div class="row">${fld(t('tag'), inp('o-tag', '', 'proxy-out'))}${fld(t('protocol'), sel('o-proto', ['freedom', 'blackhole', 'http', 'socks', 'vless', 'vmess', 'trojan', 'wireguard'], 'http'))}</div>
      <div id="dyn-out"></div>
    `, `<button class="btn btn-primary" id="o-save">${t('create')}</button>
        <button class="btn btn-ghost" onclick="Modal.close()">${t('cancel')}</button>`, true);
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
      Modal.close(); toast(t('saved')); Pages.outbounds();
    };
  },
  render() {
    const p = $('#o-proto').value;
    let h = '';
    if (p === 'freedom') h = `<div class="banner info">${t('freedom_hint')}</div>` + fld(t('send_through'), inp('o-st', '', 'IP'));
    else if (p === 'blackhole') h = `<div class="banner info">${t('blackhole_hint')}</div>`;
    else if (p === 'http' || p === 'socks') h = `<div class="row">${fld(t('address'), inp('o-addr', '', '1.2.3.4'))}${fld(t('port'), inp('o-port', '', '8080', 'number'))}</div>
      <div class="row">${fld(t('username'), inp('o-user'))}${fld(t('password_opt'), inp('o-pass'))}</div>`;
    else if (p === 'vless' || p === 'vmess') h = `<div class="row">${fld(t('address'), inp('o-addr', '', 'server.com'))}${fld(t('port'), inp('o-port', '', '443', 'number'))}</div>
      ${fld(t('uuid'), inp('o-uuid'))}<div class="row">${fld(t('security'), sel('o-sec', ['none', 'tls'], 'tls'))}${fld(t('sni'), inp('o-sni'))}</div>`;
    else if (p === 'trojan') h = `<div class="row">${fld(t('address'), inp('o-addr'))}${fld(t('port'), inp('o-port', '', '443', 'number'))}</div>
      ${fld(t('password'), inp('o-pass'))}<div class="row">${fld(t('security'), sel('o-sec', ['tls'], 'tls'))}${fld(t('sni'), inp('o-sni'))}</div>`;
    else if (p === 'wireguard') h = `<div class="row">${fld(t('endpoint'), inp('o-addr'))}${fld(t('port'), inp('o-port', '', '51820', 'number'))}</div>
      <div class="row">${fld(t('secret_key'), inp('o-secret'))}${fld(t('peer_pubkey'), inp('o-peer'))}</div>`;
    $('#dyn-out').innerHTML = h;
  }
};
async function resetOutbound(id) { await api(`/api/outbounds/${id}/reset`, { method: 'POST' }); toast(t('done')); Pages.outbounds(); }
async function delOutbound(id) { if (!confirm(t('confirm_del'))) return; await api(`/api/outbounds/${id}`, { method: 'DELETE' }); toast(t('deleted')); Pages.outbounds(); }

/* ============================ ROUTING ============================ */
Pages.routing = async () => {
  const [d, ob] = await Promise.all([api('/api/routing'), api('/api/outbounds')]);
  window._tags = ['direct', 'blocked', ...ob.outbounds.map(o => o.tag)];
  let rows = d.rules.length ? '' : `<tr><td colspan="6"><div class="empty"><div class="big">⤳</div>${t('no_rules')}</div></td></tr>`;
  d.rules.forEach(r => rows += `<tr><td><b>${esc(r.name)}</b></td><td>${esc(r.domain) || '-'}</td><td>${esc(r.ip) || '-'}</td><td>${esc(r.port) || '-'}</td>
    <td><span class="badge badge-proto">${esc(r.outbound_tag)}</span></td>
    <td class="actions"><button class="btn btn-sm btn-danger" onclick="delRule(${r.id})">✕</button></td></tr>`);
  $('#content').innerHTML = `<div class="panel"><div class="panel-head"><h3>${t('routing_title')}</h3>
    <button class="btn btn-primary" onclick="RuleForm.open()">+ ${t('new_rule')}</button></div>
    <div class="table-wrap"><table><thead><tr><th>${t('name')}</th><th>${t('domains')}</th><th>${t('ips')}</th><th>${t('port')}</th><th>Outbound</th><th>${t('actions')}</th></tr></thead>
    <tbody>${rows}</tbody></table></div></div>`;
};
const RuleForm = {
  open() {
    Modal.open(t('new_rule'), `
      ${fld(t('name'), inp('r-name', '', 'route-ir'))}
      ${fld(t('domains'), inp('r-domain', '', 'geosite:ir,example.com'))}
      ${fld(t('ips'), inp('r-ip', '', 'geoip:ir,1.2.3.4'))}
      <div class="row">${fld(t('port'), inp('r-port', '', '443'))}${fld(t('dest_outbound'), sel('r-out', window._tags || ['direct'], 'direct'))}</div>
    `, `<button class="btn btn-primary" id="r-save">${t('create')}</button><button class="btn btn-ghost" onclick="Modal.close()">${t('cancel')}</button>`);
    $('#r-save').onclick = async () => {
      await api('/api/routing', { method: 'POST', body: {
        name: $('#r-name').value || 'rule', domain: $('#r-domain').value,
        ip: $('#r-ip').value, port: $('#r-port').value, outbound_tag: $('#r-out').value } });
      Modal.close(); toast(t('saved')); Pages.routing();
    };
  }
};
async function delRule(id) { await api(`/api/routing/${id}`, { method: 'DELETE' }); toast(t('deleted')); Pages.routing(); }

/* ============================ NODES ============================ */
Pages.nodes = async () => {
  const d = await api('/api/nodes');
  let rows = d.nodes.length ? '' : `<tr><td colspan="4"><div class="empty"><div class="big">⬢</div>${t('no_nodes')}</div></td></tr>`;
  d.nodes.forEach(n => rows += `<tr><td><b>${esc(n.name)}</b></td><td>${esc(n.address)}:${n.api_port}</td>
    <td><span class="badge ${n.status === 'online' ? 'badge-on' : 'badge-off'}">${n.status}</span></td>
    <td class="actions"><button class="btn btn-sm btn-danger" onclick="delNode(${n.id})">✕</button></td></tr>`);
  $('#content').innerHTML = `<div class="panel"><div class="panel-head"><h3>${t('nodes_title')}</h3>
    <button class="btn btn-primary" onclick="NodeForm.open()">+ ${t('new_node')}</button></div>
    <div class="table-wrap"><table><thead><tr><th>${t('name')}</th><th>${t('address')}</th><th>${t('status')}</th><th>${t('actions')}</th></tr></thead>
    <tbody>${rows}</tbody></table></div></div>`;
};
const NodeForm = {
  open() {
    Modal.open(t('new_node'), `${fld(t('node_name'), inp('n-name', '', 'Germany-1'))}
      <div class="row">${fld(t('address'), inp('n-addr', '', 'de.example.com'))}${fld(t('api_port'), inp('n-port', '62050', '', 'number'))}</div>`,
      `<button class="btn btn-primary" id="n-save">${t('create')}</button><button class="btn btn-ghost" onclick="Modal.close()">${t('cancel')}</button>`);
    $('#n-save').onclick = async () => {
      await api('/api/nodes', { method: 'POST', body: { name: $('#n-name').value, address: $('#n-addr').value, api_port: +$('#n-port').value } });
      Modal.close(); toast(t('saved')); Pages.nodes();
    };
  }
};
async function delNode(id) { await api(`/api/nodes/${id}`, { method: 'DELETE' }); toast(t('deleted')); Pages.nodes(); }

/* ============================ XRAY ============================ */
Pages.xray = async () => {
  const [st, cfg] = await Promise.all([api('/api/xray/status'), api('/api/xray/config')]);
  $('#content').innerHTML = `
    <div class="panel"><div class="panel-head"><h3>${t('xray_mgmt')}</h3></div>
      <div class="pad">
        <div class="kv"><span>${t('status')}</span><span class="badge ${st.running ? 'badge-on' : 'badge-off'}">${st.running ? t('running') : t('stopped')}</span></div>
        <div class="kv"><span>${t('installed')}</span><b>${st.installed ? '✓' : '✕'}</b></div>
        <div class="kv"><span>${t('version')}</span><b>${esc(st.version)}</b></div>
        <div class="kv"><span>API ${t('port')}</span><b>${st.api_port}</b></div>
        <div class="row-btns" style="margin-top:14px">
          ${st.installed ? '' : `<button class="btn btn-primary" onclick="installXray()">⬇ ${t('install_xray')}</button>`}
          <button class="btn btn-primary" onclick="xrayAction('restart')">↻ ${t('restart')}</button>
          <button class="btn" onclick="xrayAction('start')">▶ ${t('start')}</button>
          <button class="btn" onclick="xrayAction('stop')">⏹ ${t('stop')}</button>
          <button class="btn btn-ghost" onclick="xrayAction('test')">✓ ${t('test_config')}</button>
        </div></div></div>
    <div class="panel"><div class="panel-head"><h3>${t('config_generated')}</h3>
      <button class="btn btn-sm" onclick="copyText(document.getElementById('cfgv').textContent)">📋 ${t('copy')}</button></div>
      <div class="pad"><div class="code-view" id="cfgv">${esc(JSON.stringify(cfg.config, null, 2))}</div></div></div>`;
  updateXrayPill(st.running ? 'running' : 'stopped');
};
async function xrayAction(a) {
  toast(t('running_op'));
  const d = await api(`/api/xray/${a}`, { method: 'POST' });
  toast(d.ok ? (a === 'test' ? t('valid_config') : t('done')) : (t('error') + ': ' + (d.message || '')), d.ok ? 'ok' : 'err');
  updateXrayPill(d.running ? 'running' : 'stopped');
}
function updateXrayPill(status) {
  const p = $('#xrayPill'); if (!p) return;
  p.classList.toggle('stopped', status !== 'running');
  p.innerHTML = `<span class="dot"></span> Xray ${status === 'running' ? t('running') : t('stopped')}`;
}

/* ============================ LOGS ============================ */
Pages.logs = async () => {
  const d = await api('/api/logs');
  const rows = d.logs.map(l => `<tr><td>${new Date(l.created_at * 1000).toLocaleString(LANG === 'fa' ? 'fa-IR' : LANG)}</td>
    <td><span class="badge ${l.level === 'error' ? 'badge-off' : l.level === 'warning' ? 'badge-warn' : 'badge-net'}">${l.level}</span></td><td>${esc(l.message)}</td></tr>`).join('')
    || `<tr><td colspan="3"><div class="empty"><div class="big">≡</div>${t('no_logs')}</div></td></tr>`;
  $('#content').innerHTML = `<div class="panel"><div class="panel-head"><h3>${t('system_log')}</h3>
    <button class="btn btn-sm" onclick="Pages.logs()">↻ ${t('refresh')}</button></div>
    <div class="table-wrap"><table><thead><tr><th>${t('time')}</th><th>${t('level')}</th><th>${t('message')}</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
};

/* ============================ SETTINGS ============================ */
Pages.settings = async () => {
  const s = (await api('/api/settings')).settings;
  $('#content').innerHTML = `
    <div class="panel"><div class="panel-head"><h3>${t('settings_title')}</h3></div><div class="pad">
      <div class="row">${fld(t('language'), sel('s-lang', langList().map(l => l.code), LANG))}
        ${fld(t('theme'), sel('s-theme', ['dark', 'light'], document.documentElement.getAttribute('data-theme')))}</div>
      <div class="row">${fld(t('sub_port'), inp('s-subport', s.sub_port))}${fld(t('sub_path'), inp('s-subpath', s.sub_path))}</div>
      <button class="btn btn-primary" onclick="saveSettings()">${t('save')}</button></div></div>
    <div class="panel"><div class="panel-head"><h3>${t('telegram')}</h3></div><div class="pad">
      <div class="row">${fld(t('bot_token'), inp('s-tgtoken', s.tg_token, '123:ABC'))}${fld(t('admin_chat'), inp('s-tgchat', s.tg_chat))}</div>
      <button class="btn btn-primary" onclick="saveTelegram()">${t('save_bot')}</button></div></div>
    <div class="panel"><div class="panel-head"><h3>${t('change_account')}</h3></div><div class="pad">
      <div class="row">${fld(t('new_username'), inp('s-user', window.PANEL_USER))}${fld(t('new_password'), inp('s-pass', '', '••••••', 'password'))}</div>
      <button class="btn btn-primary" onclick="saveAccount()">${t('update_account')}</button></div></div>
    <div class="panel"><div class="panel-head"><h3>${t('rest_api')}</h3></div><div class="pad hint">
      ${t('api_desc')}<br><code>GET /api/inbounds</code> · <code>POST /api/xray/restart</code> · <code>GET /api/xray/keys</code></div></div>`;
  $('#s-lang').onchange = (e) => { applyLang(e.target.value); api('/api/settings', { method: 'POST', body: { lang: e.target.value } }); buildLangMenu(); onLangChange(); };
  $('#s-theme').onchange = (e) => { document.documentElement.setAttribute('data-theme', e.target.value); applyThemeIcon(); api('/api/settings', { method: 'POST', body: { theme: e.target.value } }); };
};
async function saveSettings() {
  await api('/api/settings', { method: 'POST', body: { sub_port: $('#s-subport').value, sub_path: $('#s-subpath').value } });
  toast(t('saved'));
}
async function saveTelegram() { await api('/api/settings', { method: 'POST', body: { tg_token: $('#s-tgtoken').value, tg_chat: $('#s-tgchat').value } }); toast(t('saved')); }
async function saveAccount() {
  const d = await api('/api/account', { method: 'POST', body: { username: $('#s-user').value, password: $('#s-pass').value } });
  if (d.ok) { window.PANEL_USER = $('#s-user').value; $('#userName').textContent = window.PANEL_USER; $('#userAvatar').textContent = window.PANEL_USER[0].toUpperCase(); toast(t('account_updated')); $('#s-pass').value = ''; }
  else toast(d.error || t('error'), 'err');
}

/* ---------- periodic refresh of overview ---------- */
setInterval(() => { if ($('.nav-item.active')?.dataset.page === 'overview') Pages.overview(); }, 15000);

/* ---------- boot ---------- */
buildLangMenu();
applyLang(LANG);
$('#pageTitle').textContent = t('nav_overview');
Pages.overview();
