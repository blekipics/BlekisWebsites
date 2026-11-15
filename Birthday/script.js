// Zeitreise: vertikales Scrollen schiebt die Erinnerungen seitwärts
(function () {
  const section = document.getElementById('erinnerungen');
  if (!section) return;

  const sticky = section.querySelector('.journey-sticky');
  const track = document.getElementById('journeyTrack');
  const bar = document.getElementById('journeyBar');
  const hint = document.getElementById('journeyHint');
  const yearEl = document.getElementById('journeyYear');
  const cards = Array.from(track.querySelectorAll('.memory'));

  let maxShift = 0;
  let ticking = false;
  let currentYear = '';

  // Wie weit muss das Band fahren, und wie hoch muss der Abschnitt sein?
  function measure() {
    maxShift = Math.max(0, track.scrollWidth - sticky.clientWidth);
    section.style.height = (maxShift + sticky.offsetHeight) + 'px';
    update();
  }

  function update() {
    const total = section.offsetHeight - sticky.offsetHeight;
    const scrolled = -section.getBoundingClientRect().top;
    const p = total > 0 ? Math.min(1, Math.max(0, scrolled / total)) : 0;

    track.style.transform = 'translate3d(' + (-p * maxShift) + 'px, 0, 0)';
    bar.style.transform = 'scaleX(' + p + ')';
    hint.classList.toggle('is-hidden', p > 0.02);

    // Jahr der Karte anzeigen, die der Bildschirmmitte am nächsten ist
    const mid = sticky.clientWidth / 2;
    let best = cards[0];
    let bestDist = Infinity;
    for (const card of cards) {
      const r = card.getBoundingClientRect();
      const dist = Math.abs(r.left + r.width / 2 - mid);
      if (dist < bestDist) {
        bestDist = dist;
        best = card;
      }
    }

    // Ganz am Ende immer die letzte Karte nehmen (sie erreicht die Mitte nie)
    if (p > 0.97) best = cards[cards.length - 1];

    const year = best.dataset.year;
    if (year !== currentYear) {
      currentYear = year;
      yearEl.textContent = year;
      yearEl.classList.remove('pop');
      void yearEl.offsetWidth; // Animation neu starten
      yearEl.classList.add('pop');
    }

    ticking = false;
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', measure);
  window.addEventListener('load', measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  measure();
})();

// Brief-Intro: Umschlag öffnet sich beim Scrollen, der Brief füllt den Bildschirm
(function () {
  const section = document.getElementById('brief');
  if (!section) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const stage = section.querySelector('.brief-stage');
  const env = document.getElementById('env');
  const letter = document.getElementById('envLetter');
  const flap = document.getElementById('envFlap');
  const seal = document.getElementById('envSeal');
  const hint = document.getElementById('briefHint');
  const open = document.getElementById('briefOpen');

  let ticking = false;

  const clamp = (v) => Math.min(1, Math.max(0, v));
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const ease = (t) => t * t * (3 - 2 * t);

  function update() {
    const total = section.offsetHeight - stage.offsetHeight;
    const p = total > 0 ? clamp(-section.getBoundingClientRect().top / total) : 0;

    const H = env.offsetHeight;
    const vw = stage.clientWidth;
    const vh = stage.clientHeight;

    // 1) Siegel verschwindet, Hinweis blendet aus
    const sealT = ease(seg(p, 0.05, 0.14));
    seal.style.opacity = 1 - sealT;
    seal.style.transform = 'scale(' + (1 - 0.25 * sealT) + ')';
    hint.style.opacity = 1 - seg(p, 0.02, 0.1);

    // 2) Klappe klappt nach oben auf
    const angle = ease(seg(p, 0.1, 0.36)) * 180;
    flap.style.transform = 'perspective(1100px) rotateX(' + (-angle) + 'deg)';
    flap.style.zIndex = angle > 90 ? 1 : 4;

    // 3) Brief fährt heraus, danach in die Mitte und wächst auf Bildschirmgrösse
    const rise = ease(seg(p, 0.34, 0.6));
    const grow = ease(seg(p, 0.62, 0.9));
    const lw = letter.offsetWidth;
    const lh = letter.offsetHeight;
    const target = Math.max(vw / lw, vh / lh) * 1.04;
    // Ziel: Mitte des Bildschirms (Ruheposition des Briefs liegt bei ca. 53 % der Umschlaghöhe)
    const restCenterY = env.getBoundingClientRect().top - stage.getBoundingClientRect().top + H * 0.53;
    const finalTy = vh / 2 - restCenterY;
    const ty = -rise * H * 0.78 * (1 - grow) + finalTy * grow;
    const scale = 1 + grow * (target - 1);
    letter.style.zIndex = p > 0.6 ? 6 : 2;
    letter.style.transform = 'translate3d(0,' + ty + 'px,0) scale(' + scale + ')';

    // Inhalt des kleinen Briefs blendet aus, bevor er gross wird
    const fade = 1 - seg(p, 0.6, 0.74);
    letter.firstElementChild.style.opacity = fade;
    letter.querySelectorAll('.letter-line').forEach((l) => { l.style.opacity = 0.3 * fade; });

    // 4) Der Satz erscheint auf dem grossen Brief
    open.style.opacity = ease(seg(p, 0.84, 0.97));

    ticking = false;
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', update);
  window.addEventListener('load', update);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(update);
  update();
})();