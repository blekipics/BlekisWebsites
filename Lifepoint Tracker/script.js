(() => {
  'use strict';
  const KEY = 'lifepoint-arena-v1';
  const STARTS = [4000, 8000, 16000];
  const BOS = [0, 3, 5];
  const MAX_LP = 999999;
  const COLORS = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)'];
  const NF = new Intl.NumberFormat('de-CH');
  const fmt = n => NF.format(n);
  const rand = n => Math.floor(Math.random() * n);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const $ = (s, r = document) => r.querySelector(s);

  const arena = $('#arena'), strip = $('.strip', arena), statusEl = $('#status');
  const scrim = $('#scrim'), bUndo = $('#bUndo'), bTable = $('#bTable');
  const turnLine = $('#turnLine'), bNext = $('#bNext');
  const chips = [...document.querySelectorAll('.pchip')];

  /* ---------- Zustand ---------- */
  function fresh(count, start, keep) {
    keep = keep || {};
    return {
      count, start,
      table: keep.table !== undefined ? keep.table : coarse,
      sound: keep.sound !== false,
      bo: BOS.includes(keep.bo) ? keep.bo : 0,
      wins: Array.from({ length: count }, (_, i) => (keep.wins && keep.wins[i]) || 0),
      credited: null,
      turn: { n: 1, p: 0, ph: 0 },
      players: Array.from({ length: count }, (_, i) => ({
        name: (keep.names && keep.names[i]) || 'Spieler ' + (i + 1),
        lp: start
      })),
      log: []
    };
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || ![2, 3, 4].includes(s.count) || !STARTS.includes(s.start) || !Array.isArray(s.players) || s.players.length !== s.count) return null;
      const t = s.turn || {};
      return {
        count: s.count, start: s.start,
        table: typeof s.table === 'boolean' ? s.table : coarse,
        sound: s.sound !== false,
        bo: BOS.includes(s.bo) ? s.bo : 0,
        wins: Array.from({ length: s.count }, (_, i) => (Array.isArray(s.wins) && Number.isInteger(s.wins[i]) && s.wins[i] > 0 ? Math.min(99, s.wins[i]) : 0)),
        credited: Number.isInteger(s.credited) && s.credited >= 0 && s.credited < s.count ? s.credited : null,
        turn: {
          n: Number.isInteger(t.n) && t.n >= 1 ? t.n : 1,
          p: Number.isInteger(t.p) && t.p >= 0 && t.p < s.count ? t.p : 0,
          ph: Number.isInteger(t.ph) && t.ph >= 0 && t.ph <= 5 ? t.ph : 0
        },
        players: s.players.map((p, i) => ({
          name: typeof p.name === 'string' && p.name ? p.name.slice(0, 16) : 'Spieler ' + (i + 1),
          lp: Number.isFinite(p.lp) ? Math.max(0, Math.min(MAX_LP, Math.round(p.lp))) : s.start
        })),
        log: (Array.isArray(s.log) ? s.log : []).filter(e => e && Number.isInteger(e.i) && e.i >= 0 && e.i < s.count && Number.isFinite(e.before) && Number.isFinite(e.after)).slice(-300)
      };
    } catch (e) { return null; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  let state = load() || fresh(2, 8000, { table: coarse });

  function outcome() {
    const alive = state.players.map((p, i) => (p.lp > 0 ? i : -1)).filter(i => i >= 0);
    if (alive.length === 1) return { type: 'win', i: alive[0] };
    if (alive.length === 0) return { type: 'draw' };
    return null;
  }
  // Siege werden automatisch gutgeschrieben und bei "Zurück" wieder abgezogen.
  function settleWins() {
    const oc = outcome();
    const want = oc && oc.type === 'win' ? oc.i : null;
    if (want === state.credited) return;
    if (state.credited !== null) state.wins[state.credited] = Math.max(0, state.wins[state.credited] - 1);
    if (want !== null) state.wins[want]++;
    state.credited = want;
  }
  const target = () => (state.bo > 0 ? Math.ceil(state.bo / 2) : 0);
  function matchWinner() {
    const t = target();
    if (!t) return null;
    const i = state.wins.findIndex(w => w >= t);
    return i >= 0 ? i : null;
  }

  /* ---------- Sound (alles live erzeugt, keine Audiodateien) ---------- */
  let actx = null;
  function audio() {
    if (!state.sound) return null;
    try {
      if (!actx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        actx = new AC();
      }
      if (actx.state === 'suspended') actx.resume();
      return actx;
    } catch (e) { return null; }
  }
  function osc(a, o) {
    const type = o.type || 'sine', at = o.at || 0, d = o.d || 0.3, v = o.v || 0.2;
    const t = a.currentTime + at;
    const os = a.createOscillator(), g = a.createGain();
    os.type = type;
    os.frequency.setValueAtTime(o.f, t);
    if (o.to) os.frequency.exponentialRampToValueAtTime(o.to, t + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    os.connect(g).connect(a.destination);
    os.start(t);
    os.stop(t + d + 0.05);
  }
  function noise(a, o) {
    const at = o.at || 0, d = o.d || 0.2, v = o.v || 0.2, f = o.f || 1800;
    const t = a.currentTime + at;
    const len = Math.max(1, Math.floor(a.sampleRate * d));
    const buf = a.createBuffer(1, len, a.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource();
    src.buffer = buf;
    const lp = a.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = f;
    const g = a.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    src.connect(lp).connect(g).connect(a.destination);
    src.start(t);
  }
  function sfx(kind, p) {
    const a = audio();
    if (!a) return;
    p = p || 1;
    switch (kind) {
      case 'hit':
        osc(a, { f: 150, to: 42, d: 0.28, v: 0.5 * p });
        noise(a, { d: 0.16, v: 0.28 * p, f: 2200 });
        break;
      case 'ko':
        osc(a, { f: 110, to: 30, d: 0.7, v: 0.55 });
        noise(a, { d: 0.5, v: 0.35, f: 1200 });
        [55, 82.5, 110, 165].forEach((f, k) => osc(a, { f, at: 0.05, d: 2, v: 0.14 / (1 + k * 0.4), type: 'triangle' }));
        break;
      case 'heal':
        [523, 659, 784, 1047].forEach((f, k) => osc(a, { f, at: k * 0.07, d: 0.4, v: 0.13 }));
        break;
      case 'tick':
        osc(a, { f: 760, d: 0.05, v: 0.07, type: 'triangle' });
        break;
      case 'turn':
        osc(a, { f: 392, d: 0.25, v: 0.14, type: 'triangle' });
        osc(a, { f: 587, at: 0.11, d: 0.35, v: 0.14, type: 'triangle' });
        break;
      case 'undo':
        osc(a, { f: 640, to: 300, d: 0.2, v: 0.12, type: 'triangle' });
        break;
      case 'dice':
        noise(a, { d: 0.05, v: 0.25, f: 5000 });
        break;
      case 'coin':
        osc(a, { f: 2093, d: 0.9, v: 0.1 });
        osc(a, { f: 3136, d: 0.6, v: 0.05 });
        break;
      case 'start':
        osc(a, { f: 70, to: 320, d: 0.6, v: 0.22, type: 'sawtooth' });
        osc(a, { f: 90, to: 30, at: 0.55, d: 0.5, v: 0.5 });
        noise(a, { at: 0.55, d: 0.3, v: 0.3, f: 1800 });
        break;
    }
  }

  /* ---------- Aufbau ---------- */
  function panelHTML() {
    const btns = (sign, label) => [100, 500, 1000].map(v =>
      '<button class="btn" type="button" data-act="d" data-v="' + sign * v + '" aria-label="' + fmt(v) + ' Lifepoints ' + label + '">' + (sign < 0 ? '−' : '+') + v + '</button>').join('');
    return '<div class="panel-in">' +
      '<header class="ph"><i class="dot"></i><input class="name" type="text" maxlength="16" autocomplete="off" spellcheck="false"><span class="pips"></span><span class="tag" hidden>Sieger</span></header>' +
      '<div class="lpwrap"><div class="lp"><span class="num">0</span><span class="unit">LP</span></div><div class="deltas"></div></div>' +
      '<div class="bar"><i class="fill"></i></div>' +
      '<div class="row r-dmg">' + btns(-1, 'abziehen') + '</div>' +
      '<div class="row r-heal">' + btns(1, 'hinzufügen') + '</div>' +
      '<div class="custom">' +
        '<input class="amt" type="text" inputmode="numeric" autocomplete="off" placeholder="Betrag" aria-label="Eigener Betrag">' +
        '<button class="btn minus" type="button" data-act="apply" data-s="-1" aria-label="Betrag abziehen" disabled>−</button>' +
        '<button class="btn plus" type="button" data-act="apply" data-s="1" aria-label="Betrag hinzufügen" disabled>+</button>' +
        '<button class="btn half" type="button" data-act="half" aria-label="Lifepoints halbieren">½</button>' +
      '</div>' +
      '<div class="ko" aria-hidden="true">K.O.</div>' +
    '</div>';
  }

  function build() {
    arena.className = 'arena n' + state.count;
    const els = state.players.map((p, i) => {
      const el = document.createElement('article');
      el.className = 'panel';
      el.dataset.i = i;
      el.style.gridArea = 'p' + i;
      el.style.setProperty('--pc', COLORS[i]);
      el.innerHTML = panelHTML();
      const name = $('.name', el);
      name.value = p.name;
      name.setAttribute('aria-label', 'Name von Spieler ' + (i + 1));
      return el;
    });
    const split = state.count === 2 ? 1 : 2;
    arena.replaceChildren(...els.slice(0, split), strip, ...els.slice(split));
    state.players.forEach((_, i) => sync(i, false));
    applyTable();
    renderTurn();
    renderStatus();
  }

  const panelEl = i => arena.querySelector('.panel[data-i="' + i + '"]');

  /* ---------- Anzeige ---------- */
  function tween(el, to, animate) {
    if (el._target === to && !animate) return;
    const from = el._v == null ? to : el._v;
    el._target = to;
    cancelAnimationFrame(el._raf);
    if (!animate || reduce || from === to) { el.textContent = fmt(to); el._v = to; return; }
    const dur = Math.min(900, 260 + Math.abs(to - from) / 8);
    const t0 = performance.now();
    const step = now => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      const v = k >= 1 ? to : Math.round(from + (to - from) * e);
      el.textContent = fmt(v); el._v = v;
      if (k < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  }

  function sync(i, animate) {
    const el = panelEl(i), p = state.players[i];
    tween($('.num', el), p.lp, animate);
    const scale = Math.max(state.start, p.lp);
    const bar = $('.bar', el);
    bar.style.setProperty('--tick', (1000 / scale * 100) + '%');
    $('.fill', el).style.width = (p.lp / scale * 100) + '%';
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', fmt(p.lp) + ' von ' + fmt(state.start) + ' Lifepoints');
    const oc = outcome();
    const win = !!oc && oc.type === 'win' && oc.i === i;
    el.classList.toggle('out', p.lp === 0);
    el.classList.toggle('low', p.lp > 0 && p.lp <= state.start * 0.25);
    el.classList.toggle('win', win);
    $('.tag', el).hidden = !win;
    // Siegpunkte der Serie als Rauten
    const pips = $('.pips', el);
    const n = Math.max(target(), state.wins[i]);
    pips.replaceChildren();
    for (let k = 0; k < n; k++) {
      const s = document.createElement('i');
      s.className = 'pip' + (k < state.wins[i] ? ' on' : '');
      pips.append(s);
    }
    pips.setAttribute('aria-label', state.wins[i] + (state.wins[i] === 1 ? ' Sieg' : ' Siege'));
    markActive();
  }

  function markActive() {
    arena.querySelectorAll('.panel').forEach(el => {
      el.classList.toggle('active', +el.dataset.i === state.turn.p && !el.classList.contains('out'));
    });
  }

  function popDelta(i, d) {
    if (!d) return;
    const box = $('.deltas', panelEl(i));
    const s = document.createElement('span');
    s.className = 'delta ' + (d < 0 ? 'neg' : 'pos');
    s.textContent = (d < 0 ? '−' : '+') + fmt(Math.abs(d));
    s.style.setProperty('--dx', -Math.floor(Math.random() * 28) + 'px');
    box.append(s);
    s.addEventListener('animationend', () => s.remove());
    setTimeout(() => s.remove(), 1800);
  }
  function flash(i, d) {
    const pin = $('.panel-in', panelEl(i));
    pin.classList.remove('flash-hit', 'flash-up');
    void pin.offsetWidth;
    pin.classList.add(d < 0 ? 'flash-hit' : 'flash-up');
  }

  /* ---------- Zug und Phasen ---------- */
  function renderTurn() {
    const t = state.turn;
    turnLine.replaceChildren();
    const a = document.createElement('span');
    a.textContent = 'Zug ' + t.n + ' · ';
    const b = document.createElement('b');
    b.textContent = state.players[t.p].name;
    b.style.color = COLORS[t.p];
    turnLine.append(a, b);
    chips.forEach((c, k) => {
      c.classList.toggle('now', k === t.ph);
      c.classList.toggle('done', k < t.ph);
      c.setAttribute('aria-pressed', String(k === t.ph));
    });
    bNext.textContent = t.ph === 5 ? 'Zug beenden' : 'Weiter';
    markActive();
  }
  function passTurn() {
    const t = state.turn;
    let p = t.p;
    for (let k = 0; k < state.count; k++) {
      p = (p + 1) % state.count;
      if (state.players[p].lp > 0) break;
    }
    t.p = p; t.ph = 0; t.n++;
    sfx('turn');
  }
  function nextPhase() {
    if (state.turn.ph < 5) { state.turn.ph++; sfx('tick'); }
    else passTurn();
    save();
    renderTurn();
  }

  /* ---------- Status ---------- */
  let temp = null, tempTimer = 0;
  function setTemp(text, ttl) {
    temp = text;
    clearTimeout(tempTimer);
    renderStatus();
    if (ttl) tempTimer = setTimeout(() => { temp = null; renderStatus(); }, ttl);
  }
  function renderStatus() {
    const oc = outcome();
    const score = state.wins.join(':');
    const hasScore = state.wins.some(w => w > 0);
    let text, gold = false;
    if (temp) text = temp;
    else if (oc && oc.type === 'win') {
      const mw = matchWinner();
      text = (mw !== null ? 'Match gewonnen: ' : 'Sieger: ') + state.players[oc.i].name + (hasScore ? ' · ' + score : '');
      gold = true;
    }
    else if (oc && oc.type === 'draw') { text = 'Unentschieden'; gold = true; }
    else text = state.count + ' Spieler · ' + fmt(state.start) + ' LP' + (state.bo ? ' · Bo' + state.bo : '') + (hasScore ? ' · Serie ' + score : '');
    statusEl.textContent = text;
    statusEl.classList.toggle('gold', gold);
    bUndo.disabled = !state.log.length;
  }

  /* ---------- Screenshake ---------- */
  // Stärke und Dauer hängen davon ab, wie viel vom Startwert verloren geht. Ein K.O. schüttelt am heftigsten.
  function shake(damage, ko) {
    const ratio = Math.min(1, damage / state.start);
    try { if (navigator.vibrate) navigator.vibrate(ko ? [90, 40, 180] : Math.round(20 + ratio * 70)); } catch (e) {}
    if (reduce || !arena.animate) return;
    const amp = ko ? 30 : 3 + ratio * 42;
    const dur = ko ? 950 : Math.round(260 + ratio * 460);
    const steps = Math.round(dur / 40);
    const frames = [];
    for (let k = 0; k < steps; k++) {
      const a = amp * (1 - k / steps);
      const r = () => (Math.random() * 2 - 1) * a;
      frames.push({ transform: 'translate(' + r() + 'px,' + r() + 'px) rotate(' + r() * 0.08 + 'deg)' });
    }
    frames.push({ transform: 'translate(0,0) rotate(0deg)' });
    arena.animate(frames, { duration: dur, easing: 'linear' });
  }

  /* ---------- Aktionen ---------- */
  function change(i, delta, kind) {
    const p = state.players[i];
    const before = p.lp;
    const after = Math.max(0, Math.min(MAX_LP, before + delta));
    if (after === before) return;
    state.log.push({ t: Date.now(), i, before, after, kind: kind || 'step' });
    if (state.log.length > 300) state.log.shift();
    p.lp = after;
    settleWins();
    save();
    state.players.forEach((_, k) => sync(k, k === i));
    popDelta(i, after - before);
    flash(i, after - before);
    if (after < before) {
      shake(before - after, after === 0);
      sfx(after === 0 ? 'ko' : 'hit', 0.4 + Math.min(1, (before - after) / state.start) * 0.6);
    } else sfx('heal');
    if (temp) { temp = null; clearTimeout(tempTimer); }
    renderStatus();
  }

  function undo() {
    const e = state.log.pop();
    if (!e) return;
    state.players[e.i].lp = e.before;
    settleWins();
    save();
    state.players.forEach((_, k) => sync(k, k === e.i));
    popDelta(e.i, e.before - e.after);
    flash(e.i, e.before - e.after);
    sfx('undo');
    setTemp('Rückgängig: ' + state.players[e.i].name, 3000);
  }

  let rolling = false;
  function roll(kind) {
    if (rolling) return;
    rolling = true;
    const label = kind === 'dice' ? 'Würfel' : 'Münze';
    const pick = () => (kind === 'dice' ? String(1 + rand(6)) : (rand(2) ? 'Kopf' : 'Zahl'));
    const result = pick();
    const finish = () => { setTemp(label + ': ' + result, 6000); sfx(kind === 'coin' ? 'coin' : 'turn'); rolling = false; };
    if (reduce) { finish(); return; }
    let n = 0;
    const iv = setInterval(() => {
      if (++n >= 9) { clearInterval(iv); finish(); }
      else { setTemp(label + ': ' + pick(), 0); sfx(kind === 'dice' ? 'dice' : 'tick'); }
    }, 70);
  }

  function topRow(i) { return state.count === 2 ? i === 0 : i < 2; }
  function applyTable() {
    arena.querySelectorAll('.panel').forEach(el => el.classList.toggle('flip', state.table && topRow(+el.dataset.i)));
    bTable.setAttribute('aria-pressed', String(state.table));
  }

  /* ---------- Intro ---------- */
  let introTimer = 0;
  function showIntro() {
    const el = $('#intro');
    $('#introSub').textContent = state.players[state.turn.p].name + ' beginnt';
    el.hidden = false;
    clearTimeout(introTimer);
    introTimer = setTimeout(hideIntro, reduce ? 900 : 1800);
  }
  function hideIntro() { clearTimeout(introTimer); $('#intro').hidden = true; }

  /* ---------- Sheets ---------- */
  let openId = null, lastFocus = null;
  function renderLog() {
    const list = $('#logList'), empty = $('#logEmpty');
    list.replaceChildren();
    empty.hidden = state.log.length > 0;
    for (let k = state.log.length - 1; k >= 0; k--) {
      const e = state.log[k], d = e.after - e.before;
      const li = document.createElement('li');
      const time = document.createElement('time');
      time.textContent = new Date(e.t).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
      const mid = document.createElement('div');
      const who = document.createElement('div');
      who.className = 'who';
      const dot = document.createElement('i');
      dot.className = 'dot';
      dot.style.setProperty('--pc', COLORS[e.i]);
      const nm = document.createElement('span');
      nm.textContent = state.players[e.i].name;
      who.append(dot, nm);
      const what = document.createElement('div');
      what.className = 'what';
      what.textContent = (e.kind === 'half' ? 'Halbiert · ' : '') + fmt(e.before) + ' → ' + fmt(e.after);
      mid.append(who, what);
      const dl = document.createElement('b');
      dl.className = 'd ' + (d < 0 ? 'neg' : 'pos');
      dl.textContent = (d < 0 ? '−' : '+') + fmt(Math.abs(d));
      li.append(time, mid, dl);
      list.append(li);
    }
  }
  function syncSettings() {
    const set = (name, val) => { const r = $('input[name="' + name + '"][value="' + val + '"]'); if (r) r.checked = true; };
    set('count', state.count);
    set('start', state.start);
    set('bo', state.bo);
    set('sound', state.sound ? 1 : 0);
  }
  function openSheet(id) {
    lastFocus = document.activeElement;
    closeSheets(true);
    const sh = $(id === 'log' ? '#sheetLog' : '#sheetSet');
    if (id === 'log') renderLog(); else syncSettings();
    scrim.hidden = false;
    sh.hidden = false;
    openId = id;
    $('[data-close]', sh).focus();
  }
  function closeSheets(silent) {
    scrim.hidden = true;
    document.querySelectorAll('.sheet').forEach(s => { s.hidden = true; });
    disarm();
    if (openId && !silent && lastFocus && lastFocus.focus) lastFocus.focus();
    openId = null;
  }

  function startDuel() {
    const count = +$('input[name="count"]:checked').value;
    const start = +$('input[name="start"]:checked').value;
    const keep = {
      names: state.players.map(p => p.name),
      table: state.table, sound: state.sound, bo: state.bo,
      wins: count === state.count ? state.wins.slice() : null
    };
    state = fresh(count, start, keep);
    state.turn.p = rand(count);
    temp = null; clearTimeout(tempTimer);
    save();
    build();
    closeSheets();
    sfx('start');
    showIntro();
  }

  // Punktestand zurücksetzen braucht zwei Taps, damit es nicht aus Versehen passiert.
  const bReset = $('#bResetScore');
  let armed = false, armTimer = 0;
  function disarm() {
    armed = false;
    clearTimeout(armTimer);
    bReset.textContent = 'Punktestand zurücksetzen';
  }
  bReset.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      bReset.textContent = 'Sicher? Nochmal tippen';
      armTimer = setTimeout(disarm, 3000);
      return;
    }
    disarm();
    const oc = outcome();
    state.wins = state.wins.map(() => 0);
    state.credited = oc && oc.type === 'win' ? oc.i : null;
    save();
    state.players.forEach((_, i) => sync(i, false));
    renderStatus();
    sfx('undo');
  });

  /* ---------- Events ---------- */
  function refreshAmt(panel) {
    const v = parseInt($('.amt', panel).value, 10) || 0;
    panel.querySelectorAll('[data-act="apply"]').forEach(b => { b.disabled = !v; });
  }
  arena.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const panel = b.closest('.panel');
    const i = +panel.dataset.i;
    const act = b.dataset.act;
    if (act === 'd') change(i, +b.dataset.v);
    else if (act === 'half') { const lp = state.players[i].lp; change(i, Math.ceil(lp / 2) - lp, 'half'); }
    else if (act === 'apply') {
      const inp = $('.amt', panel);
      const v = parseInt(inp.value, 10);
      if (!v) { inp.focus(); return; }
      change(i, (+b.dataset.s) * v);
      inp.value = '';
      refreshAmt(panel);
    }
  });
  arena.addEventListener('input', e => {
    const t = e.target;
    if (t.classList.contains('amt')) {
      t.value = t.value.replace(/\D/g, '').slice(0, 6);
      refreshAmt(t.closest('.panel'));
    } else if (t.classList.contains('name')) {
      state.players[+t.closest('.panel').dataset.i].name = t.value;
      save();
      renderStatus();
      renderTurn();
    }
  });
  arena.addEventListener('change', e => {
    const t = e.target;
    if (t.classList.contains('name')) {
      const i = +t.closest('.panel').dataset.i;
      if (!t.value.trim()) t.value = 'Spieler ' + (i + 1);
      state.players[i].name = t.value.trim();
      save();
      renderStatus();
      renderTurn();
    }
  });

  bUndo.addEventListener('click', undo);
  $('#bLog').addEventListener('click', () => openSheet('log'));
  $('#bNew').addEventListener('click', () => openSheet('set'));
  $('#bDice').addEventListener('click', () => roll('dice'));
  $('#bCoin').addEventListener('click', () => roll('coin'));
  bTable.addEventListener('click', () => { state.table = !state.table; applyTable(); save(); });
  bNext.addEventListener('click', nextPhase);
  $('#phases').addEventListener('click', e => {
    const b = e.target.closest('.pchip');
    if (!b) return;
    state.turn.ph = +b.dataset.ph;
    sfx('tick');
    save();
    renderTurn();
  });
  $('#bGo').addEventListener('click', startDuel);
  $('#intro').addEventListener('click', hideIntro);
  document.querySelectorAll('input[name="bo"]').forEach(r => r.addEventListener('change', () => {
    state.bo = +r.value;
    save();
    state.players.forEach((_, i) => sync(i, false));
    renderStatus();
  }));
  document.querySelectorAll('input[name="sound"]').forEach(r => r.addEventListener('change', () => {
    state.sound = r.value === '1';
    save();
    sfx('tick');
  }));
  scrim.addEventListener('click', () => closeSheets());
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeSheets()));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && openId) closeSheets();
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !openId && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); undo(); }
  });

  /* Bildschirm anlassen, solange das Duell läuft */
  let wl = null;
  async function keepAwake() {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wl) {
        wl = await navigator.wakeLock.request('screen');
        wl.addEventListener('release', () => { wl = null; });
      }
    } catch (e) { wl = null; }
  }
  document.addEventListener('visibilitychange', keepAwake);
  document.addEventListener('pointerdown', keepAwake, { once: true });

  build();
})();
