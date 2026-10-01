/* ============ HIER DEINE LOSE ANPASSEN ============
   kind: kleine grüne Zeile oben, title: grosser Titel, text: Beschreibung */
const LOSE = [
  { kind: "Guetschi", title: "Shoggi Tag", text: "Du und ich Lindt museum hihi" },
  { kind: "Guetschi", title: "Rundi mit Coco", text: "E Usfahrt, nur du und ich, Ziel + Musik ghört dir" },
  { kind: "Niete", title: "Leider nüt gwunne :(", text: "Dafür hesh immerno mich, ich glaub das isch als trostpreis okay oder?" },
  { kind: "Guetschi", title: "Filmobig", text: "Mir gönd is Kino und du suechsch de film us" },
  { kind: "Guetschi", title: "Date-Obig", text: "ich plan alles, du muesch nur uftauche und schön usgseh, aber de zweite teil isch eh immer erfüllt *hihi*" },
  { kind: "Guetschi", title: "Streetphotography", text: "Mir gönd Streetphotography go mache oder id berge bi schnee schöni fotis go mache" },
];

const STORAGE_KEY = "revanche-lose";
const REVEAL_AT = 0.6;            // ab 60 % freigerubbelt wird aufgedeckt
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let revealed = loadState();

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch (e) { return []; }
}
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(revealed)); } catch (e) {}
}
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/* ============ RUBBEL-KRÜMEL ============ */
const crumbCanvas = document.getElementById("crumbs");
const cctx = crumbCanvas.getContext("2d");
let crumbs = [];
let crumbsRunning = false;

function sizeCrumbCanvas() {
  const dpr = window.devicePixelRatio || 1;
  crumbCanvas.width = innerWidth * dpr;
  crumbCanvas.height = innerHeight * dpr;
  cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
sizeCrumbCanvas();
window.addEventListener("resize", sizeCrumbCanvas);

// Neue Krümel an einer Bildschirmposition erzeugen
function spawnCrumbs(x, y, count) {
  if (reduceMotion) return;
  const green = cssVar("--green");
  // Hell, dunkel und ein Hauch Silber, damit man sie auch vor Grün sieht
  const CRUMB_COLORS = [green, "#065c34", "#7ee0ad", "#c9c9c9"];
  for (let n = 0; n < count; n++) {
    crumbs.push({
      x: x + (Math.random() - .5) * 20,
      y: y + (Math.random() - .5) * 10,
      vx: (Math.random() - .5) * 2.4,      // seitlicher Schwung
      vy: -Math.random() * 1.5,            // kleiner Hüpfer nach oben
      size: 3 + Math.random() * 4,         // etwas grösser als vorher
      rot: Math.random() * Math.PI,
      vr: (Math.random() - .5) * .25,      // Drehung
      life: 1,                              // 1 = voll sichtbar, 0 = weg
      color: CRUMB_COLORS[Math.floor(Math.random() * CRUMB_COLORS.length)]
    });
  }
  if (!crumbsRunning) { crumbsRunning = true; requestAnimationFrame(tickCrumbs); }
}

// Ein Animationsschritt: Schwerkraft, Bewegung, Ausblenden
function tickCrumbs() {
  cctx.clearRect(0, 0, innerWidth, innerHeight);
  crumbs.forEach(c => {
    c.vy += .18; c.vx *= .98;
    c.x += c.vx; c.y += c.vy; c.rot += c.vr;
    c.life -= .012;
    cctx.save();
    cctx.globalAlpha = Math.max(c.life, 0);
    cctx.translate(c.x, c.y); cctx.rotate(c.rot);
    cctx.fillStyle = c.color;
    cctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size * .7);
    cctx.restore();
  });
  crumbs = crumbs.filter(c => c.life > 0 && c.y < innerHeight + 20);
  if (crumbs.length) requestAnimationFrame(tickCrumbs);
  else { crumbsRunning = false; cctx.clearRect(0, 0, innerWidth, innerHeight); }
}

const grid = document.getElementById("grid");

LOSE.forEach((los, i) => {
  const card = document.createElement("article");
  card.className = "ticket";
  card.innerHTML = `
    <div class="content">
      <p class="kind">${los.kind}</p>
      <h2>${los.title}</h2>
      <p class="text">${los.text}</p>
    </div>
    <canvas tabindex="0" role="button" aria-label="Los ${i + 1} freirubbeln (Enter deckt es auf)"></canvas>`;
  grid.appendChild(card);
  setupScratch(card, i);
});

function setupScratch(card, i) {
  const canvas = card.querySelector("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let drawing = false, last = null, moves = 0, lastWidth = 0;

  if (revealed.includes(i)) { canvas.classList.add("gone"); return; }

  // Deckschicht zeichnen (grün mit "RUBBELN")
  function paint() {
    const r = card.getBoundingClientRect();
    if (Math.abs(r.width - lastWidth) < 2) return;
    lastWidth = r.width;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = r.width * dpr;
    canvas.height = r.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = cssVar("--green");
    ctx.fillRect(0, 0, r.width, r.height);
    ctx.strokeStyle = "rgba(0,0,0,.10)";
    ctx.lineWidth = 1;
    for (let x = -r.height; x < r.width; x += 7) {
      ctx.beginPath(); ctx.moveTo(x, r.height); ctx.lineTo(x + r.height, 0); ctx.stroke();
    }
    ctx.fillStyle = "#000";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `${Math.round(r.height * 0.32)}px "Bebas Neue", Impact, sans-serif`;
    ctx.fillText("RUBBELN", r.width / 2, r.height / 2 - 6);
    ctx.font = `500 ${Math.max(11, Math.round(r.height * 0.075))}px Montserrat, Arial, sans-serif`;
    ctx.fillText(i === 2 ? "Viel Glück." : "Mitem finger eifach drüber rubble hihi", r.width / 2, r.height / 2 + r.height * 0.2);
  }

  document.fonts.ready.then(() => { lastWidth = 0; paint(); });
  paint();
  new ResizeObserver(() => { if (!canvas.classList.contains("gone")) paint(); }).observe(card);

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  // Ist an dieser Stelle noch Rubbelschicht? Nur dann sollen Krümel fallen
  function hasCoverAt(p) {
    const scale = canvas.width / canvas.clientWidth;
    const px = ctx.getImageData(Math.floor(p.x * scale), Math.floor(p.y * scale), 1, 1).data;
    return px[3] > 128;
  }
  function scratch(p) {
    if (hasCoverAt(p)) {
      const r = canvas.getBoundingClientRect();
      spawnCrumbs(r.left + p.x, r.top + p.y, 2 + Math.floor(Math.random() * 3));
    }
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 38; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo((last || p).x, (last || p).y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
    if (++moves % 6 === 0) checkProgress();
  }
  function checkProgress() {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let clear = 0, total = 0;
    for (let a = 3; a < data.length; a += 4 * 24) {
      total++;
      if (data[a] < 128) clear++;
    }
    if (clear / total > REVEAL_AT) reveal();
  }
  function reveal() {
    if (canvas.classList.contains("gone")) return;
    drawing = false;
    // Der Rest der Schicht zerbröselt über das ganze Los
    const r = canvas.getBoundingClientRect();
    for (let k = 0; k < 14; k++) {
      spawnCrumbs(r.left + Math.random() * r.width, r.top + Math.random() * r.height, 4);
    }
    canvas.classList.add("gone");
    if (!revealed.includes(i)) revealed.push(i);
    saveState();
    update(true);
  }

  canvas.addEventListener("pointerdown", e => {
    drawing = true; last = null;
    canvas.setPointerCapture(e.pointerId);
    scratch(pos(e));
  });
  canvas.addEventListener("pointermove", e => { if (drawing) scratch(pos(e)); });
  ["pointerup", "pointercancel"].forEach(t =>
    canvas.addEventListener(t, () => { drawing = false; last = null; checkProgress(); }));
  canvas.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); reveal(); }
  });

  
}

function update(justRevealed) {
  document.getElementById("count").textContent = `${revealed.length}/${LOSE.length}`;
  const finale = document.getElementById("finale");
  if (revealed.length === LOSE.length) {
    const wasHidden = !finale.classList.contains("show");
    finale.classList.add("show");
    if (justRevealed && wasHidden) {
      confetti();
      setTimeout(() => finale.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" }), 700);
    }
  }
}

/* ============ KONFETTI (nur beim allerletzten Los) ============ */
/* ============ KONFETTI (nur beim allerletzten Los) ============ */
function confetti() {
  if (reduceMotion) return;
  const c = document.getElementById("confetti"), x = c.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  x.setTransform(dpr, 0, 0, dpr, 0, 0);

  const DURATION = 7000;   // Gesamtdauer in Millisekunden
  const colors = [cssVar("--green"), cssVar("--ink"), "#ffffff", cssVar("--green"), "#7ee0ad"];
  const parts = [];

  function makePart(px, py, vx, vy) {
    return {
      x: px, y: py, vx, vy,
      w: 6 + Math.random() * 6, h: 3 + Math.random() * 5,
      rot: Math.random() * 6, vr: (Math.random() - .5) * .3,
      flip: Math.random() * Math.PI, vflip: .05 + Math.random() * .1,   // Papier-Flattern
      sway: Math.random() * Math.PI * 2,                                // seitliches Pendeln
      color: colors[Math.floor(Math.random() * colors.length)]
    };
  }

  // Eine Salve an einer Stelle (Angaben in Prozent der Bildschirmgrösse)
  function burst(xFrac, yFrac, count) {
    for (let n = 0; n < count; n++) {
      parts.push(makePart(
        innerWidth * xFrac + (Math.random() - .5) * 40,
        innerHeight * yFrac,
        (Math.random() - .5) * 10,
        -Math.random() * 12 - 3
      ));
    }
  }

  // Wo und wann die Salven losgehen (delay in ms)
  const BURSTS = [
    { x: .5, y: .35, delay: 0 },
    { x: .15, y: .45, delay: 300 },
    { x: .85, y: .45, delay: 300 },
    { x: .3, y: .7, delay: 900 },
    { x: .7, y: .7, delay: 900 },
    { x: .5, y: .55, delay: 1600 },
  ];
  BURSTS.forEach(b => setTimeout(() => burst(b.x, b.y, 60), b.delay));

  // Zusätzlich ein Regen, der von oben über den ganzen Bildschirm fällt
  for (let n = 0; n < 90; n++) {
    parts.push(makePart(
      Math.random() * innerWidth,
      -Math.random() * innerHeight * .8 - 10,   // startet versetzt oberhalb des Bildschirms
      (Math.random() - .5) * 2,
      Math.random() * 2
    ));
  }

  const start = performance.now();
  (function frame(t) {
    const elapsed = t - start;
    x.clearRect(0, 0, innerWidth, innerHeight);
    // In der letzten Sekunde sanft ausblenden statt abrupt verschwinden
    x.globalAlpha = Math.min(1, (DURATION - elapsed) / 1000);
    parts.forEach(p => {
      p.vy = Math.min(p.vy + .22, 4.5);       // Schwerkraft, aber mit Luftwiderstand
      p.vx *= .985;
      p.sway += .05;
      p.x += p.vx + Math.sin(p.sway) * .8;    // leichtes Hin- und Herpendeln
      p.y += p.vy;
      p.rot += p.vr; p.flip += p.vflip;
      x.save(); x.translate(p.x, p.y); x.rotate(p.rot);
      x.fillStyle = p.color;
      x.fillRect(-p.w / 2, -p.h / 2, p.w * Math.cos(p.flip), p.h);   // cos = Drehen im Raum
      x.restore();
    });
    if (elapsed < DURATION) requestAnimationFrame(frame);
    else { x.globalAlpha = 1; x.clearRect(0, 0, innerWidth, innerHeight); }
  })(start);
}

/* ============ AGB-SPERRE ============ */
const AGB_KEY = "revanche-agb";
const gate = document.getElementById("agbGate");
const scrollBox = document.getElementById("agbScroll");
const check = document.getElementById("agbCheck");
const acceptBtn = document.getElementById("agbAccept");
const declineBtn = document.getElementById("agbDecline");
const hint = document.getElementById("agbHint");

function agbAccepted() {
  try { return localStorage.getItem(AGB_KEY) === "ja"; } catch (e) { return false; }
}

if (agbAccepted()) {
  gate.classList.add("hidden");
} else {
  document.body.classList.add("locked");
}

// Checkbox erst freigeben, wenn ganz runtergescrollt wurde
function checkScrolled() {
  const atBottom = scrollBox.scrollTop + scrollBox.clientHeight >= scrollBox.scrollHeight - 8;
  if (atBottom && check.disabled) {
    check.disabled = false;
    hint.textContent = "Wow, du hesh würkli alles glese? Respekt.";
  }
}
scrollBox.addEventListener("scroll", checkScrolled);
checkScrolled(); // falls der Text so kurz ist, dass man gar nicht scrollen muss

check.addEventListener("change", () => { acceptBtn.disabled = !check.checked; });

acceptBtn.addEventListener("click", () => {
  try { localStorage.setItem(AGB_KEY, "ja"); } catch (e) {}
  gate.classList.add("hidden");
  document.body.classList.remove("locked");
  window.scrollTo(0, 0);
});

// Der Ablehnen-Button gibt nach ein paar Klicks einfach auf
const NEIN = ["Sicher?", "Ganz sicher?", "Das zählt ned i has ned gse", "wieso machsch es immer so schwer"];
let neinCount = 0;
declineBtn.addEventListener("click", () => {
  if (neinCount < NEIN.length) {
    declineBtn.textContent = NEIN[neinCount++];
  } else {
    declineBtn.remove();
    hint.textContent = "De Ablehn-Button isch ned ich und het demfall kei bock hüt uf dich.";
  }
});

/* ============ RESET (setzt auch die AGB zurück) ============ */
document.getElementById("reset").addEventListener("click", () => {
  revealed = []; saveState();
  try { localStorage.removeItem(AGB_KEY); } catch (e) {}
  location.reload();
});

update(false);