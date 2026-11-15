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

// Intro: Anhänger fällt ab, Band wird abgezogen, dann ist die Seite da
(function () {
  const section = document.getElementById('brief');
  if (!section) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const stage = section.querySelector('.brief-stage');
  const ribbon = document.getElementById('giftRibbon');
  const bow = document.getElementById('giftBow');
  const fall = document.getElementById('giftFall');
  const hint = document.getElementById('giftHint');
  if (!stage || !ribbon || !bow || !fall || !hint) return;

  // Erst jetzt wird die Bühne angeheftet (ohne JavaScript bleibt es ein normales Hero)
  document.documentElement.classList.add('js-intro');

  let ticking = false;

  const clamp = (v) => Math.min(1, Math.max(0, v));
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const ease = (t) => t * t * (3 - 2 * t);

  function update() {
    const total = section.offsetHeight - stage.offsetHeight;
    const p = total > 0 ? clamp(-section.getBoundingClientRect().top / total) : 0;
    const vh = stage.clientHeight;

    // 1) Hinweis blendet aus
    hint.style.opacity = 1 - seg(p, 0.0, 0.1);

    // 2) Anhänger reisst ab und fällt
    const drop = ease(seg(p, 0.04, 0.34));
    fall.style.transform = 'translate3d(' + (drop * 40) + 'px,' + (drop * vh * 0.9) + 'px,0) rotate(' + (drop * 28) + 'deg)';
    fall.style.opacity = 1 - seg(p, 0.24, 0.36);
    fall.style.visibility = drop >= 1 ? 'hidden' : 'visible';

    // 3) Band und Schleife werden nach oben abgezogen
    const pull = ease(seg(p, 0.26, 0.94));
    const up = -pull * (vh * 1.15);
    ribbon.style.transform = 'translate3d(-50%,' + up + 'px,0) rotate(' + (pull * 2) + 'deg)';
    bow.style.transform = 'translate3d(0,' + up + 'px,0) rotate(' + (pull * 8) + 'deg)';

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
