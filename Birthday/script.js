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