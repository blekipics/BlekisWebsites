'use strict';
/* Sparplan – verschlüsselte, lokale Sparplan-App (PWA)
 *
 * Sicherheitskonzept (v1):
 *  - Alle Daten werden mit AES-256-GCM verschlüsselt, bevor sie gespeichert werden.
 *  - Schlüssel = PBKDF2-HMAC-SHA256 (600'000 Iterationen) aus deiner Passphrase + zufälligem Salt.
 *  - Der Schlüssel ist ein nicht exportierbares CryptoKey-Objekt und lebt nur im Arbeitsspeicher.
 *  - Frische 96-Bit-IV bei jedem Speichern; KDF-Parameter sind als AAD an den Chiffretext gebunden.
 *  - Auto-Sperre bei Inaktivität / App-Wechsel, Inhalt wird beim Wegwechseln ausgeblendet.
 *  - Kein innerHTML, keine Fremdskripte, keine Netzwerkaufrufe; strikte CSP (siehe index.html / _headers).
 *  - Entschlüsselte Daten werden strikt validiert (normalize), bevor die App sie anfasst.
 */
(() => {
  // ───────────────────────── Konstanten ─────────────────────────
  const STORE = 'sparplan.vault';
  const ITER = 600000;
  const IDLE_MS = 2 * 60 * 1000;
  const HIDDEN_MAX_MS = 30 * 1000;
  const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const INTERVALS = [[1, 'Monat', 'monatlich'], [3, 'Quartal', 'vierteljährlich'], [6, 'Halbjahr', 'halbjährlich'], [12, 'Jahr', 'jährlich']];

/*THEMES*/
  const THEMES = [{"id": "forest", "name": "Forest Green & Ivory", "desc": "Waldgrün, Elfenbein, Koralle", "fl": "#f6f1e3", "ba": "#2e5e45", "pop": "#f2705a"}, {"id": "pool", "name": "Pool Blue & Dark Cocoa", "desc": "Frisch und warm, Pop: Solar Yellow", "fl": "#bfe6ec", "ba": "#3b2a22", "pop": "#ffc21a"}, {"id": "navy", "name": "Warm Sand & Midnight Navy", "desc": "Klassisch, edel, Pop: Tangerine", "fl": "#ebddc6", "ba": "#16213e", "pop": "#ff7a21"}, {"id": "lilac", "name": "Lilac Mist & Deep Aubergine", "desc": "Verspielt, Pop: Acid Lime", "fl": "#dcd3f0", "ba": "#2a1740", "pop": "#c7f23b"}, {"id": "bone", "name": "Bone & Slate", "desc": "Grafisch, Pop: Signal Red", "fl": "#ece8df", "ba": "#2c3842", "pop": "#ff4a36"}, {"id": "sage", "name": "Sage & Charcoal", "desc": "Natürlich, Pop: Hot Pink", "fl": "#cbd6c2", "ba": "#24292b", "pop": "#ff4d94"}, {"id": "oat", "name": "Oat & Olive", "desc": "Erdig, Pop: Cobalt Blue", "fl": "#efe6d2", "ba": "#4a5036", "pop": "#2f5bff"}];
  /*END*/

  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const $app = document.getElementById('app');

  // ───────────────────────── Zustand (nur im Speicher) ─────────────────────────
  let vault = null;      // { v, kdf } – öffentliche Parameter
  let key = null;        // CryptoKey (nicht exportierbar)
  let state = null;      // entschlüsselte Daten
  let tab = 'home';
  let selMonth = 0;
  let lastAct = Date.now();
  let hiddenAt = 0;
  let fails = 0;
  let demo = false;      // Demo-Modus: Beispieldaten nur im Speicher
  let realState = null;  // echte Daten während der Demo

  // ───────────────────────── Kleine Helfer ─────────────────────────
  const h = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style') Object.assign(e.style, v);
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return e;
  };

  const NS = 'http://www.w3.org/2000/svg';
  const svg = (paths, { size = 24, sw = 1.8 } = {}) => {
    const s = document.createElementNS(NS, 'svg');
    const set = (el, o) => Object.entries(o).forEach(([k, v]) => el.setAttribute(k, v));
    set(s, { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': sw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
    for (const d of paths) { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); s.append(p); }
    return s;
  };
  const IC = {
    pie: ['M12 3v9h9', 'M12 3a9 9 0 1 0 9 9'],
    cal: ['M6 5h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z', 'M3 10h18', 'M8 3v4', 'M16 3v4'],
    repeat: ['M17 2l4 4-4 4', 'M3 11V9a3 3 0 0 1 3-3h15', 'M7 22l-4-4 4-4', 'M21 13v2a3 3 0 0 1-3 3H3'],
    target: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18', 'M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10', 'M12 11a1 1 0 1 0 0 2a1 1 0 1 0 0-2'],
    more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
    lock: ['M7 11V8a5 5 0 0 1 10 0v3', 'M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z', 'M12 15v2'],
    chevR: ['M9 6l6 6-6 6'], check: ['M5 13l4 4L19 7'],
    palette: ['M12 3a9 9 0 1 0 0 18c1.2 0 1.9-.8 1.9-1.7 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4C21 6.5 17 3 12 3z', 'M7.5 11h.01', 'M10 7.5h.01', 'M14.5 7.5h.01'], chevL: ['M15 6l-6 6 6 6'], plus: ['M12 5v14', 'M5 12h14']
  };

  const uid = () => b64(crypto.getRandomValues(new Uint8Array(6))).replace(/[^A-Za-z0-9]/g, 'x');
  const fmtNum = new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const chf = (n) => 'CHF ' + fmtNum.format(n || 0);
  const pct = (n) => Math.round((n || 0) * 100) + ' %';
  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  function parseMoney(s) {
    const t = String(s).replace(/[’'\s]/g, '').replace(',', '.');
    if (t === '') return { ok: true, v: null };
    if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return { ok: false };
    const n = Number(t);
    if (!isFinite(n) || Math.abs(n) > 1e9) return { ok: false };
    return { ok: true, v: Math.round(n * 100) / 100 };
  }
  const dateLabel = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' }); };

  function toast(msg) {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    const t = h('div', { class: 'toast', role: 'status' }, msg);
    document.body.append(t);
    setTimeout(() => t.remove(), 2300);
  }

  // ───────────────────────── Krypto ─────────────────────────
  function b64(buf) { const a = new Uint8Array(buf); let s = ''; for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
  function unb64(s) { return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); }
  const aadOf = (kdf) => enc.encode(`sparplan|v1|${kdf.iter}|${kdf.salt}`);

  async function deriveKey(pass, salt, iter) {
    const base = await crypto.subtle.importKey('raw', enc.encode(pass.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function sealWith(k, kdf, data) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aadOf(kdf) }, k, enc.encode(JSON.stringify(data)));
    return JSON.stringify({ v: 1, kdf, iv: b64(iv), ct: b64(ct) });
  }
  async function seal() { localStorage.setItem(STORE, await sealWith(key, vault.kdf, state)); }

  function parseVault(raw) {
    if (typeof raw !== 'string' || raw.length > 2e6) throw new Error('size');
    const o = JSON.parse(raw);
    const k = o && o.kdf;
    if (!o || o.v !== 1 || !k || k.name !== 'PBKDF2' || k.hash !== 'SHA-256') throw new Error('format');
    if (!Number.isInteger(k.iter) || k.iter < 100000 || k.iter > 5000000) throw new Error('iter');
    if (typeof k.salt !== 'string' || unb64(k.salt).length !== 16) throw new Error('salt');
    if (typeof o.iv !== 'string' || unb64(o.iv).length !== 12) throw new Error('iv');
    if (typeof o.ct !== 'string' || o.ct.length < 24) throw new Error('ct');
    return { v: 1, kdf: { name: k.name, hash: k.hash, iter: k.iter, salt: k.salt }, iv: o.iv, ct: o.ct };
  }

  async function openVault(v, pass) {
    const k = await deriveKey(pass, unb64(v.kdf.salt), v.kdf.iter);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(v.iv), additionalData: aadOf(v.kdf) }, k, unb64(v.ct));
    return { key: k, data: normalize(JSON.parse(dec.decode(pt))) };
  }

  // ───────────────────────── Datenmodell ─────────────────────────
  const num = (x, d = null) => (typeof x === 'number' && isFinite(x) && Math.abs(x) <= 1e9 ? Math.round(x * 100) / 100 : d);
  const str = (x, max = 80) => (typeof x === 'string' ? x.slice(0, max) : '');

  function defaultState() {
    const fx = (name, interval) => ({ id: uid(), name, amount: null, interval, note: '' });
    return {
      v: 1, year: 2026, start: 2000, goal: null,
      fixed: [
        fx('Miete & Nebenkosten', 1), fx('Krankenkasse', 1), fx('Handy & Internet', 1),
        fx('Haftpflicht- & Hausratversicherung', 12), fx('Auto: Versicherung & Steuer', 12),
        fx('Abos (Streaming, Software)', 1), fx('Sonstiges Fixes', 1)
      ],
      months: Array.from({ length: 12 }, () => ({ income: null, variable: null, plan: null, actual: null })),
      goals: [
        { id: uid(), name: 'Schlafzimmer (siehe Budgetplan)', target: 3286.2, saved: 2000, due: null },
        { id: uid(), name: 'PC-Upgrade', target: null, saved: 0, due: null },
        { id: uid(), name: 'Geschenke', target: null, saved: 0, due: null },
        { id: uid(), name: 'Notgroschen', target: null, saved: 0, due: null }
      ]
    };
  }

  function normalize(o) {
    if (!o || typeof o !== 'object' || o.v !== 1) throw new Error('state');
    const arr = (x, n) => (Array.isArray(x) ? x.slice(0, n) : []);
    const out = {
      v: 1,
      year: Number.isInteger(o.year) && o.year >= 2000 && o.year <= 2200 ? o.year : new Date().getFullYear(),
      start: num(o.start, 0), goal: num(o.goal, null), fixed: [], months: [], goals: []
    };
    for (const f of arr(o.fixed, 100)) {
      if (!f || typeof f !== 'object') continue;
      out.fixed.push({ id: str(f.id, 16) || uid(), name: str(f.name, 60), amount: num(f.amount, null), interval: [1, 3, 6, 12].includes(f.interval) ? f.interval : 1, note: str(f.note, 80) });
    }
    const ms = Array.isArray(o.months) ? o.months : [];
    for (let i = 0; i < 12; i++) {
      const m = ms[i] && typeof ms[i] === 'object' ? ms[i] : {};
      out.months.push({ income: num(m.income), variable: num(m.variable), plan: num(m.plan), actual: num(m.actual) });
    }
    for (const g of arr(o.goals, 100)) {
      if (!g || typeof g !== 'object') continue;
      out.goals.push({ id: str(g.id, 16) || uid(), name: str(g.name, 60), target: num(g.target, null), saved: num(g.saved, 0), due: typeof g.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(g.due) ? g.due : null });
    }
    return out;
  }

  // ───────────────────────── Berechnungen (wie in der Vorlage) ─────────────────────────
  const perMonth = (f) => (f.amount == null ? 0 : f.amount / f.interval);
  const fixedMonthly = () => state.fixed.reduce((a, f) => a + perMonth(f), 0);

  function calcMonth(i) {
    const m = state.months[i], fx = fixedMonthly();
    const inc = m.income || 0, va = m.variable || 0, sv = m.actual || 0;
    return { has: m.income != null, inc, fx, va, sv, left: inc - fx - va, free: inc - fx - va - sv };
  }
  function calcYear() {
    let inc = 0, fx = 0, va = 0, sv = 0, plan = 0, n = 0;
    state.months.forEach((m) => {
      inc += m.income || 0; va += m.variable || 0; sv += m.actual || 0; plan += m.plan || 0;
      if (m.income > 0) fx += fixedMonthly();
      if (m.actual != null) n++;
    });
    const bal = state.start + sv;
    const goal = state.goal;
    const remain = goal != null ? Math.max(0, goal - bal) : 0;
    const left = 12 - n;
    return { inc, fx, va, sv, plan, free: inc - fx - va - sv, bal, goal, remain, progress: goal > 0 ? bal / goal : 0, left, needed: left ? remain / left : 0, ideal: goal != null ? Math.max(0, goal - state.start) / 12 : null };
  }
  const monthsUntil = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Math.max(1, Math.ceil((new Date(y, m - 1, d) - new Date()) / (30.4 * 864e5))); };

  async function commit(msg) {
    if (demo) { renderMain(true); toast('Demo: nichts wird gespeichert'); return; }
    try { await seal(); renderMain(true); if (msg) toast(msg); }
    catch (e) { toast('Speichern fehlgeschlagen.'); }
  }

  // ───────────────────────── UI-Bausteine ─────────────────────────
  const largeTitle = (t, sub, right) => h('header', { class: 'lt' }, h('div', null, sub && h('div', { class: 'eyebrow' }, sub), h('h1', null, t)), right);
  const group = (...rows) => h('section', { class: 'group' }, rows);
  const gtitle = (t) => h('h2', { class: 'gtitle' }, t);
  const gfoot = (t) => h('p', { class: 'gfoot' }, t);

  function row(left, right, o = {}) {
    return h(o.onclick ? 'button' : 'div', { class: 'row' + (o.cls ? ' ' + o.cls : ''), type: o.onclick ? 'button' : null, onclick: o.onclick },
      h('div', { class: 'rl' }, h('div', { class: 'rt' }, left), o.sub && h('div', { class: 'rs' }, o.sub)),
      h('div', { class: 'rr' }, right, o.chev && svg(IC.chevR, { size: 16, sw: 2.4 })));
  }
  const bar = (p, cls = '') => h('div', { class: 'bar' }, h('i', { class: cls, style: { width: Math.round(clamp01(p) * 100) + '%' } }));

  function donut(parts, total, top, value, neg) {
    const R = 80, C = 2 * Math.PI * R, GAP = 2.5;
    const wrap = h('div', { class: 'ring' });
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 208 208'); s.setAttribute('aria-hidden', 'true');
    const mk = (cls, extra) => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', 104); c.setAttribute('cy', 104); c.setAttribute('r', R); c.setAttribute('fill', 'none'); c.setAttribute('stroke-width', 22); c.setAttribute('class', cls); Object.entries(extra || {}).forEach(([k, v]) => c.setAttribute(k, v)); s.append(c); return c; };
    mk('track');
    let off = 0; const arcs = [];
    for (const p of parts) {
      if (p.v <= 0 || total <= 0) continue;
      const len = (p.v / total) * C, shown = Math.max(0, len - (parts.filter((x) => x.v > 0).length > 1 ? GAP : 0));
      const halo = mk('arc halo', { 'stroke-dasharray': `0 ${C}`, 'stroke-dashoffset': -off, 'stroke-width': 25 });
      const c = mk('arc ' + p.cls, { 'stroke-dasharray': `0 ${C}`, 'stroke-dashoffset': -off });
      arcs.push([c, shown], [halo, shown]); off += len;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => arcs.forEach(([c, shown]) => c.setAttribute('stroke-dasharray', `${shown} ${C - shown}`))));
    wrap.append(s, h('div', { class: 'mid' }, h('small', null, top), h('b', { class: neg ? 'neg' : '' }, value)));
    return wrap;
  }

  // ───────────────────────── Sheets & Formulare ─────────────────────────
  function sheet({ title, body, saveLabel = 'Sichern', onSave, hideSave, closeLabel = 'Abbrechen' }) {
    const scrim = h('div', { class: 'scrim' });
    const sh = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
    const esc = (e) => { if (e.key === 'Escape') close(); };
    const close = () => { document.removeEventListener('keydown', esc); sh.classList.add('out'); scrim.classList.add('out'); setTimeout(() => { sh.remove(); scrim.remove(); }, 230); };
    const save = h('button', { type: 'button', class: 'r', onclick: async () => {
      save.disabled = true;
      try { const r = await onSave(); if (r !== false) close(); } catch (e) { toast('Das hat nicht geklappt.'); }
      save.disabled = false;
    } }, saveLabel);
    sh.append(h('div', { class: 'sheet-h' }, h('button', { type: 'button', class: 'l', onclick: close }, closeLabel), h('div', { class: 't' }, title), hideSave ? h('span') : save), body);
    scrim.addEventListener('click', close);
    document.addEventListener('keydown', esc);
    document.body.append(scrim, sh);
    const first = sh.querySelector('input'); if (first) setTimeout(() => first.focus({ preventScroll: true }), 60);
    return { close };
  }

  function field(label, o = {}) {
    const inp = h('input', { type: o.type || 'text', inputmode: o.mode, placeholder: o.ph || '', value: o.value == null ? '' : String(o.value), maxlength: o.max, autocomplete: o.auto || 'off', autocapitalize: o.cap || 'sentences', spellcheck: 'false', 'aria-label': label });
    return { inp, el: h('label', { class: 'row field' + (o.full ? ' full' : '') }, h('span', { class: 'lbl' }, label), inp), get: () => inp.value };
  }
  const moneyField = (label, v, ph = '0.00') => field(label, { value: v, mode: 'decimal', ph });

  function readMoney(f, label) {
    const r = parseMoney(f.get());
    if (!r.ok) { toast(`Ungültiger Betrag: ${label}`); f.inp.focus(); return { bad: true }; }
    return r;
  }

  function seg(options, value) {
    let cur = value;
    const wrap = h('div', { class: 'seg', role: 'radiogroup' });
    const btns = options.map(([val, label]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(val === cur), class: val === cur ? 'on' : '', onclick: () => { cur = val; btns.forEach((b, i) => { const on = options[i][0] === cur; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }); } }, label));
    wrap.append(...btns);
    return { el: wrap, get: () => cur };
  }

  function dangerButton(label, fn) {
    let armed = false, timer;
    const b = h('button', { type: 'button', class: 'btn-row danger', onclick: async () => {
      if (!armed) { armed = true; b.textContent = 'Wirklich? Nochmal tippen'; timer = setTimeout(() => { armed = false; b.textContent = label; }, 3000); return; }
      clearTimeout(timer); await fn();
    } }, label);
    return b;
  }

  function confirmSheet(title, message, label, fn) {
    return sheet({ title, saveLabel: label, onSave: fn, body: h('p', { class: 'msg' }, message) });
  }

  // ───────────────────────── Editoren ─────────────────────────
  function editMonth(i) {
    const m = state.months[i];
    const fInc = moneyField('Einnahmen', m.income), fVar = moneyField('Variable Ausgaben', m.variable);
    const fPlan = moneyField('Sparen geplant', m.plan), fAct = moneyField('Sparen Ist', m.actual);
    sheet({
      title: `${MONTHS[i]} ${state.year}`,
      body: h('div', null,
        group(fInc.el, h('div', { class: 'row ro' }, h('div', { class: 'rl' }, h('div', { class: 'rt' }, 'Fixkosten'), h('div', { class: 'rs' }, 'automatisch aus «Fixkosten»')), h('div', { class: 'rr' }, chf(fixedMonthly()))), fVar.el),
        gtitle('Sparen'), group(fPlan.el, fAct.el),
        gfoot('Felder leer lassen, wenn der Monat noch nicht erfasst ist.')),
      onSave: async () => {
        const r = [[fInc, 'Einnahmen'], [fVar, 'Variable Ausgaben'], [fPlan, 'Sparen geplant'], [fAct, 'Sparen Ist']].map(([f, l]) => readMoney(f, l));
        if (r.some((x) => x.bad)) return false;
        Object.assign(state.months[i], { income: r[0].v, variable: r[1].v, plan: r[2].v, actual: r[3].v });
        await commit('Gespeichert');
      }
    });
  }

  function editFixed(f) {
    const isNew = !f;
    const cur = f || { id: uid(), name: '', amount: null, interval: 1, note: '' };
    const fName = field('Name', { value: cur.name, max: 60, ph: 'z. B. Fitness', cap: 'sentences' });
    const fAmt = moneyField('Betrag', cur.amount);
    const sg = seg(INTERVALS.map(([v, l]) => [v, l]), cur.interval);
    const fNote = field('Notiz', { value: cur.note, max: 80, ph: 'optional' });
    const body = h('div', null, group(fName.el, fAmt.el, h('div', { class: 'row' }, h('span', null, 'Intervall'), sg.el), fNote.el), gfoot('Der Betrag gilt pro gewähltem Intervall, z. B. 1’200 pro Jahr. Pro Monat wird er automatisch umgerechnet.'));
    if (!isNew) body.append(h('div', { style: { marginTop: '18px' }, class: 'group' }, dangerButton('Posten löschen', async () => { state.fixed = state.fixed.filter((x) => x.id !== cur.id); ctl.close(); await commit('Gelöscht'); })));
    const ctl = sheet({
      title: isNew ? 'Neuer Posten' : 'Fixkosten-Posten', body,
      onSave: async () => {
        const name = fName.get().trim(); if (!name) { toast('Bitte einen Namen eingeben.'); return false; }
        const a = readMoney(fAmt, 'Betrag'); if (a.bad) return false;
        Object.assign(cur, { name, amount: a.v, interval: sg.get(), note: fNote.get().trim() });
        if (isNew) state.fixed.push(cur);
        await commit('Gespeichert');
      }
    });
  }

  function editGoal(g) {
    const isNew = !g;
    const cur = g || { id: uid(), name: '', target: null, saved: 0, due: null };
    const fName = field('Name', { value: cur.name, max: 60, ph: 'z. B. Ferien' });
    const fTar = moneyField('Zielbetrag', cur.target), fSav = moneyField('Gespart bisher', cur.saved, '0.00');
    const fDue = field('Bis wann', { type: 'date', value: cur.due || '' });
    const body = h('div', null, group(fName.el, fTar.el, fSav.el, fDue.el));
    if (!isNew) body.append(h('div', { style: { marginTop: '18px' }, class: 'group' }, dangerButton('Sparziel löschen', async () => { state.goals = state.goals.filter((x) => x.id !== cur.id); ctl.close(); await commit('Gelöscht'); })));
    const ctl = sheet({
      title: isNew ? 'Neues Sparziel' : 'Sparziel', body,
      onSave: async () => {
        const name = fName.get().trim(); if (!name) { toast('Bitte einen Namen eingeben.'); return false; }
        const t = readMoney(fTar, 'Zielbetrag'); if (t.bad) return false;
        const s = readMoney(fSav, 'Gespart bisher'); if (s.bad) return false;
        const d = fDue.get();
        Object.assign(cur, { name, target: t.v, saved: s.v || 0, due: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null });
        if (isNew) state.goals.push(cur);
        await commit('Gespeichert');
      }
    });
  }

  function depositGoal(g) {
    const fAmt = moneyField('Betrag', null, '0.00');
    sheet({
      title: 'Einzahlen', saveLabel: 'Buchen',
      body: h('div', null, h('p', { class: 'msg' }, g.name), group(fAmt.el)),
      onSave: async () => {
        const a = readMoney(fAmt, 'Betrag'); if (a.bad) return false;
        if (!a.v) return false;
        g.saved = Math.round(((g.saved || 0) + a.v) * 100) / 100;
        await commit('Gebucht');
      }
    });
  }

  function editPlan() {
    const fYear = field('Jahr', { value: state.year, mode: 'numeric' });
    const fStart = moneyField('Startguthaben', state.start), fGoal = moneyField('Jahressparziel', state.goal);
    sheet({
      title: 'Sparplan', body: h('div', null, group(fYear.el, fStart.el, fGoal.el), gfoot('Jahressparziel = Guthaben, das du bis Jahresende erreichen willst.')),
      onSave: async () => {
        const y = parseInt(fYear.get(), 10); if (!(y >= 2000 && y <= 2200)) { toast('Ungültiges Jahr.'); return false; }
        const s = readMoney(fStart, 'Startguthaben'); if (s.bad) return false;
        const g = readMoney(fGoal, 'Jahressparziel'); if (g.bad) return false;
        Object.assign(state, { year: y, start: s.v || 0, goal: g.v });
        await commit('Gespeichert');
      }
    });
  }

  // ───────────────────────── Diagramme & Kennzahlen ─────────────────────────
  const svgEl = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v); return e; };
  const kfmt = (n) => (Math.abs(n) >= 1000 ? (Math.round(n / 100) / 10) + 'k' : String(Math.round(n)));
  function niceMax(v) { if (!(v > 0)) return 100; const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }

  // Diagramme werden nach dem Einhängen auf die echte Breite gezeichnet (1 Einheit = 1 Pixel, Schrift bleibt lesbar).
  function chartBox(draw) { const b = h('div', { class: 'chart-box' }); b._draw = draw; return b; }
  function drawCharts() {
    document.querySelectorAll('.chart-box').forEach((b) => { const w = Math.floor(b.clientWidth); if (w > 60 && b._draw) b.replaceChildren(b._draw(w)); });
  }
  function frame(W, H, max, label) {
    const L = 46, R = 10, T = 12, B = 26, pw = W - L - R, ph = H - T - B;
    const s = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': label });
    for (let g = 0; g <= 4; g++) {
      const y = T + ph * g / 4;
      s.append(svgEl('line', { x1: L, x2: W - R, y1: y, y2: y, class: 'ch-grid' }));
      const t = svgEl('text', { x: L - 8, y: y + 4, 'text-anchor': 'end', class: 'ch-axis' }); t.textContent = kfmt(max * (1 - g / 4)); s.append(t);
    }
    const X = (i) => L + pw * (i + .5) / 12, Y = (v) => T + ph * (1 - Math.max(0, v) / max);
    const narrow = pw / 12 < 30;
    MONTHS.forEach((m, i) => { const t = svgEl('text', { x: X(i), y: H - 7, 'text-anchor': 'middle', class: 'ch-axis' }); t.textContent = narrow ? m[0] : m.slice(0, 3); s.append(t); });
    return { s, X, Y, L, R, T, ph, pw };
  }
  const pathOf = (pts) => pts.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)).join(' ');

  function lineChart() {
    return chartBox((W) => {
      const H = 240, act = [], plan = [];
      let a = state.start, p = state.start, last = -1;
      state.months.forEach((m, i) => { if (m.actual != null) last = i; });
      state.months.forEach((m, i) => { p += m.plan || 0; plan.push(p); if (i <= last) { a += m.actual || 0; act.push(a); } });
      const vals = [...plan, ...act, state.start]; if (state.goal != null) vals.push(state.goal);
      const max = niceMax(Math.max(...vals, 1));
      const { s, X, Y, L, R, ph, T } = frame(W, H, max, 'Sparverlauf über das Jahr');
      if (state.goal != null) s.append(svgEl('line', { x1: L, x2: W - R, y1: Y(state.goal), y2: Y(state.goal), class: 'ch-goal' }));
      s.append(svgEl('path', { d: pathOf(plan.map((v, i) => [X(i), Y(v)])), class: 'ch-plan' }));
      if (act.length) {
        const pts = act.map((v, i) => [X(i), Y(v)]), base = T + ph;
        s.append(svgEl('path', { d: pathOf(pts) + ` L${pts[pts.length - 1][0].toFixed(1)} ${base} L${pts[0][0].toFixed(1)} ${base} Z`, class: 'ch-area' }));
        s.append(svgEl('path', { d: pathOf(pts), class: 'ch-act' }));
        pts.forEach(([x, y], i) => { const now = i === pts.length - 1; const c = svgEl('circle', { cx: x, cy: y, r: now ? 6.5 : 4, class: 'ch-dot' + (now ? ' ch-now' : '') }); const t = svgEl('title'); t.textContent = `${MONTHS[i]}: ${chf(act[i])}`; c.append(t); s.append(c); });
      }
      return s;
    });
  }

  function barsChart() {
    return chartBox((W) => {
      const H = 220, cs = state.months.map((m, i) => calcMonth(i));
      const tot = cs.map((c) => (c.has ? c.fx + c.va + c.sv + Math.max(c.free, 0) : 0));
      const max = niceMax(Math.max(...tot, 1));
      const { s, X, Y, pw } = frame(W, H, max, 'Verwendung des Einkommens pro Monat');
      const bw = Math.min(34, pw / 12 * .62);
      cs.forEach((c, i) => {
        if (!c.has) return;
        let acc = 0;
        [['b-fix', c.fx, 'Fixkosten'], ['b-var', c.va, 'Variable'], ['b-sav', c.sv, 'Gespart'], ['b-free', Math.max(c.free, 0), 'Frei']].forEach(([cls, v, l]) => {
          if (v <= 0) return;
          const y1 = Y(acc + v), y0 = Y(acc);
          const r = svgEl('rect', { x: X(i) - bw / 2, y: y1, width: bw, height: Math.max(0, y0 - y1 - 1), rx: 2, class: cls });
          const t = svgEl('title'); t.textContent = `${MONTHS[i]} · ${l}: ${chf(v)}`; r.append(t); s.append(r); acc += v;
        });
      });
      return s;
    });
  }
  const chartLegend = (items) => h('div', { class: 'ch-leg' }, items.map(([l, c]) => h('span', null, h('span', { class: 'dot ' + c }), l)));

  function fixedBars() {
    const items = state.fixed.filter((f) => f.amount != null).sort((a, b) => perMonth(b) - perMonth(a));
    if (!items.length) return h('p', { class: 'gfoot', style: { padding: '0' } }, 'Noch keine Beträge erfasst.');
    const mx = Math.max(...items.map(perMonth), 1), sum = items.reduce((a, f) => a + perMonth(f), 0) || 1;
    return h('div', { class: 'hbars' }, items.map((f) => h('div', { class: 'hb' },
      h('div', { class: 'hb-t' }, h('span', null, f.name || 'Ohne Namen'), h('b', null, `${chf(perMonth(f))} · ${pct(perMonth(f) / sum)}`)),
      h('div', { class: 'bar' }, h('i', { class: 'blue', style: { width: Math.round(perMonth(f) / mx * 100) + '%' } })))));
  }

  function kpiTiles(c, y) {
    const n = state.months.filter((m) => m.actual != null).length;
    const proj = state.start + (n ? y.sv / n * 12 : 0), dev = y.sv - y.plan, rate = y.inc > 0 ? y.sv / y.inc : null;
    const tiles = [
      ['Frei diesen Monat', c.has ? chf(c.free) : '–', c.has ? MONTHS[selMonth] : 'noch nicht erfasst', c.has && c.free < 0 ? 'neg' : ''],
      ['Gespart im Jahr', chf(y.sv), y.plan ? `${dev >= 0 ? '+' : ''}${chf(dev)} zum Plan` : 'kein Plan erfasst', y.plan && dev < 0 ? 'neg' : ''],
      ['Sparquote', rate == null ? '–' : pct(rate), 'vom Einkommen', ''],
      ['Prognose Jahresende', n ? chf(proj) : '–', y.goal != null && n ? (proj >= y.goal ? 'Ziel in Reichweite' : `${chf(y.goal - proj)} unter dem Ziel`) : 'bei gleichem Tempo', y.goal != null && n && proj < y.goal ? 'neg' : '']
    ];
    return h('div', { class: 'kpis d-kpis' }, tiles.map(([l, v, s, cls]) => h('div', { class: 'kpi' }, h('small', null, l), h('b', { class: cls }, v), h('span', null, s))));
  }

  // ───────────────────────── Ansichten ─────────────────────────
  function viewHome() {
    const c = calcMonth(selMonth), y = calcYear();
    const wrap = h('div', null, largeTitle('Übersicht', `Sparplan ${state.year}`, h('button', { type: 'button', class: 'fab ghost', 'aria-label': 'Design wählen', onclick: openThemes }, svg(IC.palette, { size: 20, sw: 1.9 }))));
    const dash = h('div', { class: 'dash' });
    const hero = h('div', { class: 'd-hero' });

    hero.append(h('div', { class: 'stepper' },
      h('button', { type: 'button', 'aria-label': 'Vorheriger Monat', onclick: () => { selMonth = (selMonth + 11) % 12; renderMain(); } }, svg(IC.chevL, { size: 20, sw: 2.4 })),
      h('b', null, MONTHS[selMonth]),
      h('button', { type: 'button', 'aria-label': 'Nächster Monat', onclick: () => { selMonth = (selMonth + 1) % 12; renderMain(); } }, svg(IC.chevR, { size: 20, sw: 2.4 }))));

    if (!c.has) {
      hero.append(h('div', { class: 'card empty' }, h('b', null, `Noch nichts für ${MONTHS[selMonth]}`), h('p', null, 'Trag deine Einnahmen ein, dann siehst du sofort, was nach allen Ausgaben übrig bleibt.'), h('button', { type: 'button', class: 'btn', onclick: () => editMonth(selMonth) }, 'Monat erfassen')));
    } else {
      const neg = c.free < 0;
      const total = neg ? c.fx + c.va + c.sv : c.inc;
      const rows = [['Fixkosten', c.fx, 'c-fix'], ['Variable', c.va, 'c-var'], ['Gespart', c.sv, 'c-sav'], [neg ? 'Überzogen' : 'Frei verfügbar', c.free, 'c-free']];
      hero.append(h('div', { class: 'card hero' },
        donut([{ v: c.fx, cls: 'c-fix' }, { v: c.va, cls: 'c-var' }, { v: c.sv, cls: 'c-sav' }, { v: c.free, cls: 'c-free' }], total, neg ? 'Defizit' : 'Frei verfügbar', chf(c.free), neg),
        h('div', { class: 'legend' }, rows.map(([l, v, cls]) => h('div', { class: 'row' }, h('div', { class: 'rl' }, h('span', { class: 'dot ' + cls }), l), h('div', { class: 'rr' }, h('span', { class: 'strong' }, chf(v)), h('span', null, c.inc ? pct(v / c.inc) : '')))))));
    }
    dash.append(hero, kpiTiles(c, y));

    dash.append(h('div', { class: 'card d-c1' }, h('h3', null, 'Sparverlauf'), lineChart(),
      chartLegend([['Ist', 'c-fix'], ['Plan', 'c-sand'], ['Ziel', 'c-var']])));

    const side = h('div', { class: 'd-side' });
    side.append(h('div', { class: 'card' }, h('h3', null, 'Bisher im Jahr'),
      [['Einnahmen', y.inc], ['Fixkosten', y.fx], ['Variable Ausgaben', y.va], ['Gespart (Ist)', y.sv]].map(([l, v]) => h('div', { class: 'kv' }, h('span', null, l), h('b', null, chf(v)))),
      h('div', { class: 'kv', style: { marginTop: '6px' } }, h('span', null, 'Frei verfügbar'), h('b', { class: y.free < 0 ? 'neg' : '' }, chf(y.free)))));
    if (y.goal == null) {
      side.append(h('div', { class: 'card' }, h('h3', null, 'Jahresziel'), h('p', { style: { color: 'var(--sub)', fontSize: '15px', marginBottom: '12px' } }, `Aktuelles Guthaben: ${chf(y.bal)}. Setz dir ein Sparziel für ${state.year}.`), h('button', { type: 'button', class: 'btn ghost', onclick: editPlan }, 'Jahresziel festlegen')));
    } else {
      side.append(h('div', { class: 'card' }, h('h3', null, 'Jahresziel'),
        h('div', { class: 'goal-h' }, h('span', { class: 'big' }, pct(y.progress)), h('span', { style: { color: 'var(--sub)' } }, `${chf(y.bal)} von ${chf(y.goal)}`)),
        bar(y.progress, y.progress >= 1 ? '' : 'blue'),
        h('div', { class: 'kv' }, h('span', null, 'Noch bis zum Ziel'), h('b', null, chf(y.remain))),
        h('div', { class: 'kv' }, h('span', null, `Nötig pro verbleibendem Monat (${y.left})`), h('b', null, chf(y.needed))),
        h('div', { class: 'kv' }, h('span', null, 'Ideale Sparrate pro Monat'), h('b', null, chf(y.ideal)))));
    }
    dash.append(side);

    dash.append(h('div', { class: 'card d-c2' }, h('h3', null, 'Wohin das Geld fliesst'), barsChart(),
      chartLegend([['Fixkosten', 'c-fix'], ['Variable', 'c-var'], ['Gespart', 'c-sav'], ['Frei', 'c-free']])));
    wrap.append(dash);
    return wrap;
  }

  function viewMonths() {
    const y = calcYear(), dev = y.sv - y.plan, now = new Date();
    const wrap = h('div', null, largeTitle('Monate', `Sparplan ${state.year}`));
    const cols = h('div', { class: 'cols' });
    const a = h('div', { class: 'c-a' });
    a.append(h('div', { class: 'card' }, h('h3', null, 'Sparen im Jahr'),
      h('div', { class: 'kv' }, h('span', null, 'Geplant'), h('b', null, chf(y.plan))),
      h('div', { class: 'kv' }, h('span', null, 'Ist'), h('b', null, chf(y.sv))),
      h('div', { class: 'kv' }, h('span', null, 'Abweichung'), h('b', { class: dev < 0 ? 'neg' : dev > 0 ? 'pos' : '' }, (dev > 0 ? '+' : '') + chf(dev)))));
    a.append(h('div', { class: 'card d-only' }, h('h3', null, 'Wohin das Geld fliesst'), barsChart(), chartLegend([['Fixkosten', 'c-fix'], ['Variable', 'c-var'], ['Gespart', 'c-sav'], ['Frei', 'c-free']])));
    const list = h('div', { class: 'c-list' }, group(MONTHS.map((name, i) => {
      const m = state.months[i], c = calcMonth(i), cur = now.getFullYear() === state.year && now.getMonth() === i;
      const sub = m.income == null ? 'Noch nicht erfasst' : `Einnahmen ${chf(m.income)}${m.actual != null ? ' · gespart ' + chf(m.actual) : ''}`;
      return row([name, cur && h('span', { class: 'badge' }, 'jetzt')], m.income == null ? '' : h('span', { class: c.free < 0 ? 'neg strong' : 'strong' }, chf(c.free)), { onclick: () => editMonth(i), sub, chev: true });
    })), gfoot('Rechts: frei verfügbar nach Fixkosten, Ausgaben und Sparen.'));
    cols.append(a, list); wrap.append(cols);
    return wrap;
  }

  function viewFixed() {
    const mo = fixedMonthly();
    const wrap = h('div', null, largeTitle('Fixkosten', null, h('button', { type: 'button', class: 'fab', 'aria-label': 'Posten hinzufügen', onclick: () => editFixed(null) }, svg(IC.plus, { size: 20, sw: 2.6 }))));
    const cols = h('div', { class: 'cols' });
    const a = h('div', { class: 'c-a' });
    a.append(h('div', { class: 'card' }, h('h3', null, 'Total'), h('div', { class: 'big' }, chf(mo)), h('div', { class: 'kv', style: { marginTop: '6px' } }, h('span', null, 'pro Monat'), h('b', null, `${chf(mo * 12)} / Jahr`))));
    a.append(h('div', { class: 'card' }, h('h3', null, 'Die grössten Brocken'), fixedBars()));
    const list = h('div', { class: 'c-list' }, group(state.fixed.map((f) => row(f.name || 'Ohne Namen', f.amount == null ? h('span', null, 'Betrag offen') : h('span', { class: 'strong' }, chf(perMonth(f))),
      { onclick: () => editFixed(f), chev: true, sub: f.amount == null ? INTERVALS.find((x) => x[0] === f.interval)[2] : `${chf(f.amount)} · ${INTERVALS.find((x) => x[0] === f.interval)[2]}${f.note ? ' · ' + f.note : ''}` }))),
      gfoot(state.fixed.length ? 'Rechts steht jeweils der Betrag pro Monat.' : 'Noch keine Posten. Tippe oben rechts auf +.'));
    cols.append(a, list); wrap.append(cols);
    return wrap;
  }

  function viewGoals() {
    const tot = state.goals.reduce((a, g) => ({ t: a.t + (g.target || 0), s: a.s + (g.saved || 0) }), { t: 0, s: 0 });
    const wrap = h('div', null, largeTitle('Ziele', null, h('button', { type: 'button', class: 'fab', 'aria-label': 'Sparziel hinzufügen', onclick: () => editGoal(null) }, svg(IC.plus, { size: 20, sw: 2.6 }))));
    wrap.append(h('div', { class: 'card' }, h('h3', null, 'Alle Ziele'), h('div', { class: 'big' }, chf(tot.s)), h('div', { class: 'kv', style: { marginTop: '6px' } }, h('span', null, 'von'), h('b', null, chf(tot.t))), tot.t > 0 && bar(tot.s / tot.t, 'blue')));
    wrap.append(h('section', { class: 'group goals-grid' }, state.goals.map((g) => {
      const p = g.target > 0 ? (g.saved || 0) / g.target : 0, miss = g.target != null ? Math.max(0, g.target - (g.saved || 0)) : null;
      const need = miss != null && g.due && miss > 0 ? miss / monthsUntil(g.due) : null;
      return h('div', { class: 'goal' },
        h('button', { type: 'button', class: 'goal-h', style: { width: '100%' }, onclick: () => editGoal(g), 'aria-label': g.name + ' bearbeiten' }, h('b', null, g.name || 'Ohne Namen'), h('span', { style: { color: 'var(--sub)', fontVariantNumeric: 'tabular-nums' } }, g.target > 0 ? pct(p) : 'Ziel offen')),
        g.target > 0 ? bar(p, p >= 1 ? '' : 'blue') : h('div', { style: { height: '10px' } }),
        h('div', { class: 'kv' }, h('span', null, 'Gespart'), h('b', null, `${chf(g.saved)}${g.target != null ? ' / ' + chf(g.target) : ''}`)),
        miss != null && h('div', { class: 'kv' }, h('span', null, 'Fehlt noch'), h('b', null, chf(miss))),
        g.due && h('div', { class: 'kv' }, h('span', null, `Bis ${dateLabel(g.due)}`), h('b', null, need != null ? `${chf(need)} / Monat` : '')),
        h('div', { style: { marginTop: '10px' } }, h('button', { type: 'button', class: 'pill', onclick: () => depositGoal(g) }, '+ Einzahlen')));
    })));
    return wrap;
  }

  function viewMore() {
    const wrap = h('div', null, largeTitle('Mehr', 'Einstellungen'));
    const y = calcYear();
    const cur = THEMES.find((x) => x.id === theme.t);
    const A = h('div', { class: 'c-a2' }), B = h('div', { class: 'c-b2' });
    A.append(gtitle('Design'), group(row('Farbschema', [themeDots(cur), cur.name.split(' & ')[0]], { onclick: openThemes, chev: true })));
    A.append(gtitle('Sparplan'), group(
      row('Jahr', String(state.year), { onclick: editPlan, chev: true }),
      row('Startguthaben', chf(state.start), { onclick: editPlan, chev: true }),
      row('Jahressparziel', y.goal == null ? 'nicht gesetzt' : chf(y.goal), { onclick: editPlan, chev: true }),
      row('Neues Jahr starten', '', { cls: 'blue', onclick: newYear })));
    A.append(gtitle('Sicherung'), group(
      row('Verschlüsselte Sicherung exportieren', '', { cls: 'blue', onclick: exportBackup }),
      row('Sicherung importieren', '', { cls: 'blue', onclick: importBackup })),
    gfoot('Die Sicherungsdatei ist verschlüsselt. Ohne deine Passphrase ist sie wertlos, auch wenn sie jemand findet.'));
    B.append(gtitle('Sicherheit'), group(
      row('Jetzt sperren', '', { cls: 'blue', onclick: () => lock('Gesperrt.') }),
      row('Passphrase ändern', '', { cls: 'blue', onclick: changePass }),
      row('Auto-Sperre', '2 Min. Inaktivität'),
      row('Tresor löschen', '', { cls: 'danger', onclick: wipe })));
    B.append(gtitle('Ausprobieren'), group(row(demo ? 'Demo beenden' : 'Beispieldaten ansehen', '', { cls: 'blue', onclick: demo ? exitDemo : startDemo })),
      gfoot('Zeigt die App mit erfundenen Zahlen. Deine echten Daten bleiben unberührt, im Demo-Modus wird nichts gespeichert.'));
    B.append(gtitle('So ist die App geschützt'), h('section', { class: 'group sec-list' },
      h('p', null, h('b', null, 'Verschlüsselt im Gerät'), 'AES-256-GCM. Der Schlüssel entsteht aus deiner Passphrase (PBKDF2, 600’000 Runden) und liegt nur im Arbeitsspeicher.'),
      h('p', null, h('b', null, 'Nichts verlässt das Gerät'), 'Keine Server, kein Tracking, keine Fremdskripte. Eine strikte Content-Security-Policy blockiert alles andere.'),
      h('p', null, h('b', null, 'Ehrliche Grenze'), 'Wer dein entsperrtes Gerät hat oder eine schwache Passphrase errät, kommt an die Daten. Wähl mindestens vier zufällige Wörter.')));
    wrap.append(h('div', { class: 'cols2' }, A, B));
    wrap.append(h('p', { class: 'foot' }, 'Sparplan v2 · lokal & verschlüsselt'));
    return wrap;
  }

  // ───────────────────────── Demo-Modus ─────────────────────────
  // Beispieldaten leben nur im Arbeitsspeicher. commit() speichert im Demo nie, die echten Daten bleiben unberührt.
  function demoState() {
    const y = new Date().getFullYear(), up = Math.min(11, Math.max(5, new Date().getMonth() - 1));
    const inc = [7400, 7400, 7650, 7400, 7400, 8100, 7400, 7400, 7400, 7650, 7400, 9200];
    const va = [2150, 1980, 2320, 2050, 2240, 2610, 2890, 2310, 1960, 2180, 2100, 2800];
    const pl = Array.from({ length: 12 }, (_, i) => (i <= up ? 1300 : null)), ac = [1250, 1400, 1100, 1350, 1200, 900, 700, 1250, 1450, 1300, 1300, 1300];
    return {
      v: 1, year: y, start: 4200, goal: 19000,
      fixed: [
        ['Miete', 1750, 1, ''], ['Krankenkasse (2 Personen)', 640, 1, ''], ['Steuern', 1800, 3, 'Rate'], ['ÖV-Abo', 85, 1, ''], ['Handy & Internet', 119, 1, ''],
        ['Fitness', 89, 1, ''], ['Streaming', 28, 1, ''], ['Serafe', 335, 12, ''], ['Haftpflicht & Hausrat', 380, 12, '']
      ].map(([name, amount, interval, note]) => ({ id: uid(), name, amount, interval, note })),
      months: inc.map((v, i) => (i <= up ? { income: v, variable: va[i], plan: pl[i], actual: ac[i] } : { income: null, variable: null, plan: null, actual: null })),
      goals: [
        { id: uid(), name: 'Ferien', target: 4000, saved: 2150, due: `${y + 1}-06-30` },
        { id: uid(), name: 'Notgroschen', target: 15000, saved: 8200, due: null },
        { id: uid(), name: 'Neue Waschmaschine', target: 1200, saved: 900, due: `${y + 1}-03-31` }
      ]
    };
  }
  function startDemo() {
    if (demo) return;
    realState = state; state = demoState(); demo = true; tab = 'home'; selMonth = Math.min(11, Math.max(5, new Date().getMonth() - 1));
    renderMain(); window.scrollTo(0, 0);
  }
  function exitDemo() {
    if (!demo) return;
    state = realState; realState = null; demo = false; selMonth = Math.min(new Date().getMonth(), 11); tab = 'home';
    renderMain(); toast('Demo beendet');
  }
  const noDemo = () => { if (demo) { toast('Im Demo-Modus nicht möglich.'); return true; } return false; };
  const demoBanner = () => h('div', { class: 'demo-banner', role: 'status' }, h('span', null, 'Demo · erfundene Zahlen, nichts wird gespeichert'), h('button', { type: 'button', class: 'pill', onclick: exitDemo }, 'Beenden'));


  // ───────────────────────── Design (Farbschema) ─────────────────────────
  // Nur die Design-Wahl liegt unverschlüsselt im Speicher (damit schon der Sperrbildschirm im richtigen Look erscheint).
  const THEME_KEY = 'sparplan.theme';
  const MODES = [['auto', 'Automatisch'], ['light', 'Hell'], ['dark', 'Dunkel']];
  let theme = { t: 'forest', m: 'auto' };

  function loadTheme() {
    try {
      const o = JSON.parse(localStorage.getItem(THEME_KEY) || 'null');
      if (o && THEMES.some((x) => x.id === o.t) && MODES.some((x) => x[0] === o.m)) theme = { t: o.t, m: o.m };
    } catch (e) { /* Standard bleibt */ }
  }
  function applyTheme() {
    const r = document.documentElement;
    r.setAttribute('data-theme', theme.t); r.setAttribute('data-mode', theme.m);
    requestAnimationFrame(() => {
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
      const bg = getComputedStyle(r).getPropertyValue('--bg').trim();
      if (bg) document.head.append(h('meta', { name: 'theme-color', content: bg }));
    });
  }
  function setTheme(patch) {
    theme = { ...theme, ...patch };
    try { localStorage.setItem(THEME_KEY, JSON.stringify(theme)); } catch (e) { /* ignorieren */ }
    applyTheme();
  }
  const themeDots = (t) => h('span', { class: 'sw3', 'aria-hidden': 'true' }, [t.fl, t.ba, t.pop].map((c) => h('i', { style: { background: c } })));

  function openThemes() {
    const list = h('section', { class: 'group' });
    const fill = () => list.replaceChildren(...THEMES.map((t) => h('button', { type: 'button', class: 'row theme-row', role: 'radio', 'aria-checked': String(t.id === theme.t), onclick: () => { setTheme({ t: t.id }); fill(); renderMain(true); } },
      h('div', { class: 'rl' }, h('div', { class: 'rt' }, themeDots(t), t.name), h('div', { class: 'rs' }, t.desc)),
      h('div', { class: 'rr check' }, t.id === theme.t ? svg(IC.check, { size: 22, sw: 2.6 }) : null))));
    fill();
    const sg = seg(MODES, theme.m);
    sg.el.addEventListener('click', () => setTimeout(() => setTheme({ m: sg.get() }), 0));
    sheet({ title: 'Design', hideSave: true, closeLabel: 'Fertig',
      body: h('div', null, h('div', { class: 'mode' }, sg.el), list, gfoot('Das Design wird sofort angewendet. Gespeichert wird nur diese Auswahl, nie deine Zahlen im Klartext.')) });
  }

  // ───────────────────────── Aktionen ─────────────────────────
  function newYear() {
    if (noDemo()) return;
    const y = calcYear();
    confirmSheet(`Jahr ${state.year + 1} starten`, `Das Startguthaben wird auf ${chf(y.bal)} gesetzt, alle Monate werden geleert. Fixkosten und Sparziele bleiben erhalten. Exportiere vorher eine Sicherung, falls du das alte Jahr behalten willst.`, 'Starten', async () => {
      state.year += 1; state.start = Math.round(y.bal * 100) / 100; state.goal = null;
      state.months = Array.from({ length: 12 }, () => ({ income: null, variable: null, plan: null, actual: null }));
      selMonth = 0; await commit('Neues Jahr gestartet');
    });
  }

  async function exportBackup() {
    if (noDemo()) return;
    const raw = localStorage.getItem(STORE); if (!raw) return;
    const name = `sparplan-sicherung-${new Date().toISOString().slice(0, 10)}.sparplan`;
    const blob = new Blob([raw], { type: 'application/json' });
    try {
      const file = new File([blob], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Sparplan-Sicherung' }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast('Sicherung heruntergeladen');
  }

  function importBackup() {
    if (noDemo()) return;
    const inp = h('input', { type: 'file', accept: '.sparplan,application/json', style: { display: 'none' } });
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0]; inp.remove(); if (!f) return;
      let v;
      try { if (f.size > 2e6) throw new Error('size'); v = parseVault(await f.text()); } catch (e) { toast('Das ist keine gültige Sicherung.'); return; }
      const fPass = field('Passphrase', { type: 'password', auto: 'off', cap: 'none', full: true, ph: 'Passphrase der Sicherung' });
      sheet({
        title: 'Sicherung einspielen', saveLabel: 'Einspielen',
        body: h('div', null, h('p', { class: 'msg' }, 'Achtung: Die aktuellen Daten in dieser App werden ersetzt.'), group(fPass.el)),
        onSave: async () => {
          try {
            const r = await openVault(v, fPass.get());
            vault = { v: 1, kdf: v.kdf }; key = r.key; state = r.data;
            localStorage.setItem(STORE, JSON.stringify({ v: 1, kdf: v.kdf, iv: v.iv, ct: v.ct }));
            renderMain(); toast('Sicherung eingespielt');
          } catch (e) { toast('Falsche Passphrase oder beschädigte Datei.'); return false; }
        }
      });
    });
    document.body.append(inp); inp.click();
  }

  function changePass() {
    if (noDemo()) return;
    const f1 = field('Neue Passphrase', { type: 'password', auto: 'new-password', cap: 'none', full: true, ph: 'mind. 12 Zeichen' });
    const f2 = field('Wiederholen', { type: 'password', auto: 'new-password', cap: 'none', full: true, ph: 'nochmals' });
    sheet({
      title: 'Passphrase ändern', body: h('div', null, group(f1.el, f2.el), gfoot('Alte Sicherungsdateien bleiben mit der alten Passphrase verschlüsselt.')),
      onSave: async () => {
        const a = f1.get(), b = f2.get();
        if (a.length < 12) { toast('Mindestens 12 Zeichen.'); return false; }
        if (a !== b) { toast('Die Eingaben stimmen nicht überein.'); return false; }
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const kdf = { name: 'PBKDF2', hash: 'SHA-256', iter: ITER, salt: b64(salt) };
        const nk = await deriveKey(a, salt, ITER);
        localStorage.setItem(STORE, await sealWith(nk, kdf, state));
        key = nk; vault = { v: 1, kdf }; toast('Passphrase geändert');
      }
    });
  }

  function wipe() {
    if (noDemo()) return;
    const f = field('Zur Bestätigung', { full: true, ph: 'LÖSCHEN eintippen', cap: 'characters' });
    sheet({
      title: 'Tresor löschen', saveLabel: 'Löschen',
      body: h('div', null, h('p', { class: 'msg' }, 'Löscht alle Daten dieser App auf diesem Gerät unwiderruflich. Eine exportierte Sicherung bleibt gültig.'), group(f.el)),
      onSave: async () => {
        if (f.get().trim() !== 'LÖSCHEN') { toast('Bitte LÖSCHEN eintippen.'); return false; }
        localStorage.removeItem(STORE); vault = null; key = null; state = null; fails = 0;
        document.querySelectorAll('.scrim, .sheet').forEach((n) => n.remove());
        showSetup();
      }
    });
  }

  // ───────────────────────── Hauptansicht ─────────────────────────
  const TABS = [['home', 'Übersicht', IC.pie], ['months', 'Monate', IC.cal], ['fixed', 'Fixkosten', IC.repeat], ['goals', 'Ziele', IC.target], ['more', 'Mehr', IC.more]];
  const go = (id) => { if (tab !== id) { tab = id; renderMain(); window.scrollTo(0, 0); } };
  function tabbar() {
    return h('div', { class: 'tabbar' }, h('nav', { 'aria-label': 'Hauptmenü' }, TABS.map(([id, label, ic]) =>
      h('button', { type: 'button', class: 'tab', 'aria-current': id === tab ? 'page' : null, onclick: () => go(id) },
        svg(ic, { size: 25, sw: id === 'more' ? 3.4 : 1.8 }), h('span', null, label)))));
  }
  function sidebar() {
    const item = (label, ic, on, cur, sw) => h('button', { type: 'button', class: 'side-item', 'aria-current': cur ? 'page' : null, onclick: on }, svg(ic, { size: 20, sw: sw || 1.9 }), h('span', null, label));
    return h('aside', { class: 'side' },
      h('div', { class: 'brand' }, h('div', { class: 'brand-ic' }, svg(IC.lock, { size: 20, sw: 2 })), h('div', null, h('b', null, 'Sparplan'), h('small', null, String(state.year)))),
      h('nav', { 'aria-label': 'Hauptmenü' }, TABS.map(([id, label, ic]) => item(label, ic, () => go(id), id === tab, id === 'more' ? 3.4 : 1.9))),
      h('div', { class: 'side-foot' }, item('Design', IC.palette, openThemes), item('Sperren', IC.lock, () => lock('Gesperrt.'))));
  }
  function renderMain(keepScroll) {
    if (!state) return;
    const y = window.scrollY;
    const views = { home: viewHome, months: viewMonths, fixed: viewFixed, goals: viewGoals, more: viewMore };
    $app.replaceChildren(h('div', { class: 'shell' }, sidebar(), h('main', { class: 'view' }, demo && demoBanner(), views[tab]())), tabbar());
    drawCharts();
    if (keepScroll) window.scrollTo(0, y);
  }
  let rzT = 0;
  window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { if (state) drawCharts(); }, 120); });

  // ───────────────────────── Sperre / Einrichtung ─────────────────────────
  function lock(msg) {
    document.querySelectorAll('.scrim, .sheet, .toast').forEach((n) => n.remove());
    state = null; key = null; demo = false; realState = null;
    if (vault) showLock(msg); else showSetup();
  }

  function strength(p) {
    let pool = 0;
    if (/[a-z]/.test(p)) pool += 26; if (/[A-Z]/.test(p)) pool += 26; if (/\d/.test(p)) pool += 10; if (/[^A-Za-z0-9]/.test(p)) pool += 32;
    const eff = Math.min(p.length, new Set(p).size * 2);
    return Math.floor(Math.log2(Math.max(pool, 1)) * eff);
  }

  function authShell(title, lead, ...rest) {
    return h('form', { class: 'auth', autocomplete: 'off', novalidate: 'novalidate' },
      h('div', { class: 'emblem' }, svg(IC.lock, { size: 38, sw: 1.8 })), h('h1', null, title), h('p', { class: 'lead' }, lead), rest);
  }

  function showSetup() {
    const p1 = h('input', { type: 'password', placeholder: 'Passphrase', autocomplete: 'new-password', autocapitalize: 'none', spellcheck: 'false', 'aria-label': 'Passphrase' });
    const p2 = h('input', { type: 'password', placeholder: 'Wiederholen', autocomplete: 'new-password', autocapitalize: 'none', spellcheck: 'false', 'aria-label': 'Passphrase wiederholen' });
    const mi = h('i'), hint = h('div', { class: 'hint' }, 'Tipp: vier oder fünf zufällige Wörter'), err = h('div', { class: 'err', role: 'alert' });
    const btn = h('button', { type: 'submit', class: 'btn' }, 'Tresor erstellen');
    p1.addEventListener('input', () => {
      err.textContent = '';
      const b = strength(p1.value), q = clamp01(b / 80);
      mi.style.width = Math.round(q * 100) + '%';
      mi.style.background = b < 40 ? 'var(--red)' : b < 60 ? 'var(--orange)' : 'var(--green)';
      hint.textContent = !p1.value ? 'Tipp: vier oder fünf zufällige Wörter' : p1.value.length < 12 ? `Noch ${12 - p1.value.length} Zeichen bis zum Minimum` : b < 40 ? 'Schwach' : b < 60 ? 'Okay' : b < 80 ? 'Gut' : 'Sehr gut';
    });
    const form = authShell('Sparplan', 'Erstelle deinen verschlüsselten Tresor. Die Passphrase kann niemand zurücksetzen. Verlierst du sie, sind die Daten weg.',
      h('div', { class: 'group' }, h('div', { class: 'row' }, p1), h('div', { class: 'row' }, p2)), h('div', { class: 'meter' }, mi), hint, err, btn);
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); err.textContent = '';
      if (p1.value.length < 12) { err.textContent = 'Mindestens 12 Zeichen.'; return; }
      if (p1.value !== p2.value) { err.textContent = 'Die Eingaben stimmen nicht überein.'; return; }
      btn.disabled = true; btn.textContent = 'Erstelle…';
      try {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const kdf = { name: 'PBKDF2', hash: 'SHA-256', iter: ITER, salt: b64(salt) };
        key = await deriveKey(p1.value, salt, ITER); vault = { v: 1, kdf }; state = defaultState();
        await seal();
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
        startSession();
      } catch (ex) { err.textContent = 'Das hat nicht geklappt. Läuft die App über HTTPS?'; btn.disabled = false; btn.textContent = 'Tresor erstellen'; key = null; state = null; }
    });
    $app.replaceChildren(form); setTimeout(() => p1.focus({ preventScroll: true }), 80);
  }

  function showLock(msg) {
    const p = h('input', { type: 'password', placeholder: 'Passphrase', autocomplete: 'current-password', autocapitalize: 'none', spellcheck: 'false', 'aria-label': 'Passphrase' });
    const err = h('div', { class: 'err', role: 'alert' }, msg || '');
    const btn = h('button', { type: 'submit', class: 'btn' }, 'Entsperren');
    const form = authShell('Gesperrt', 'Gib deine Passphrase ein, um den Sparplan zu öffnen.', h('div', { class: 'group' }, h('div', { class: 'row' }, p)), err, btn);
    let wait = 0, timer;
    const tick = () => { if (wait > 0) { err.textContent = `Zu viele Versuche. Bitte ${wait} s warten.`; btn.disabled = true; wait--; timer = setTimeout(tick, 1000); } else { btn.disabled = false; err.textContent = ''; } };
    if (fails >= 3) { wait = Math.min(60, 2 ** (fails - 2)); tick(); }
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); if (btn.disabled || !p.value) return;
      btn.disabled = true; btn.textContent = 'Entsperre…'; err.textContent = '';
      try {
        const r = await openVault(parseVault(localStorage.getItem(STORE)), p.value);
        vault = { v: 1, kdf: parseVault(localStorage.getItem(STORE)).kdf };
        key = r.key; state = r.data; fails = 0; p.value = ''; clearTimeout(timer); startSession();
      } catch (ex) {
        fails++; p.value = ''; btn.textContent = 'Entsperren'; btn.disabled = false;
        err.textContent = 'Falsche Passphrase oder beschädigte Daten.';
        if (fails >= 3) { wait = Math.min(60, 2 ** (fails - 2)); tick(); }
      }
    });
    $app.replaceChildren(form); setTimeout(() => p.focus({ preventScroll: true }), 80);
  }

  function startSession() {
    const now = new Date();
    tab = 'home'; selMonth = now.getFullYear() === state.year ? now.getMonth() : 0;
    lastAct = Date.now(); renderMain(); window.scrollTo(0, 0);
  }

  // ───────────────────────── Auto-Sperre & Privatsphäre ─────────────────────────
  ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach((ev) => addEventListener(ev, () => { lastAct = Date.now(); }, { passive: true, capture: true }));
  setInterval(() => { if (state && Date.now() - lastAct > IDLE_MS) lock('Automatisch gesperrt (Inaktivität).'); }, 5000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); document.body.classList.add('blur'); }
    else {
      document.body.classList.remove('blur');
      if (state && ((hiddenAt && Date.now() - hiddenAt > HIDDEN_MAX_MS) || Date.now() - lastAct > IDLE_MS)) lock('Automatisch gesperrt.');
    }
  });
  addEventListener('pagehide', () => document.body.classList.add('blur'));
  addEventListener('pageshow', () => document.body.classList.remove('blur'));

  // ───────────────────────── Start ─────────────────────────
  function fatal(msg) { $app.replaceChildren(h('div', { class: 'auth' }, h('h1', null, 'Nicht möglich'), h('p', { class: 'lead' }, msg))); }
  (function boot() {
    loadTheme(); applyTheme();
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme());
    if (!window.isSecureContext || !window.crypto || !crypto.subtle) { fatal('Sichere Verschlüsselung ist hier nicht verfügbar. Öffne die App über HTTPS.'); return; }
    try {
      const raw = localStorage.getItem(STORE);
      vault = raw ? parseVault(raw) : null;
    } catch (e) { fatal('Gespeicherte Daten sind beschädigt oder der Speicher ist gesperrt. Importiere eine Sicherung oder lösche die Website-Daten.'); return; }
    if (vault) showLock(); else showSetup();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  })();
})();
