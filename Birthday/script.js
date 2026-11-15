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
  const open = document.getElementById('briefOpen');
  if (!stage || !ribbon || !bow || !fall || !hint || !open) return;

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

    // 2) Anhänger reisst ab: erst ein kleiner Ruck, dann fällt er immer schneller
    const t = seg(p, 0.04, 0.3);
    const x = Math.sin(t * Math.PI) * 26 + t * 30;
    const y = t * t * vh * 1.05;
    const rot = t * 26 + Math.sin(t * 9) * 6 * (1 - t);
    fall.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) rotate(' + rot + 'deg)';
    fall.style.opacity = 1 - seg(p, 0.22, 0.3);
    fall.style.visibility = t >= 1 ? 'hidden' : 'visible';

    // 3) Band und Schleife werden nach oben abgezogen
    const pull = ease(seg(p, 0.24, 0.6));
    const up = -pull * (vh * 1.15);
    ribbon.style.transform = 'translate3d(-50%,' + up + 'px,0) rotate(' + (pull * 2) + 'deg)';
    bow.style.transform = 'translate3d(0,' + up + 'px,0) rotate(' + (pull * 8) + 'deg)';

    // 4) Ruhiger Moment: "Ich hab da was für dich …" blendet ein, bleibt kurz, blendet aus
    const inn = ease(seg(p, 0.56, 0.68));
    const out = ease(seg(p, 0.86, 0.96));
    open.style.opacity = inn * (1 - out);
    open.style.transform = 'translate3d(0,' + ((1 - inn) * 18 - out * 18) + 'px,0)';

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


// Warum ich dich liebe: Karten umdrehen
document.querySelectorAll('.flip').forEach(function (card) {
  card.addEventListener('click', function () {
    const on = card.classList.toggle('is-flipped');
    card.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
});

// Quiz: Wie gut kennst du uns?
// Hier kannst du die Fragen ändern. "richtig" ist die Nummer der richtigen Antwort (0 = erste).
(function () {
  const FRAGEN = [
    {
      frage: '[Frage 1: Wo war unser erstes Date?]',
      antworten: ['[Antwort A]', '[Antwort B]', '[Antwort C]'],
      richtig: 0,
      hinweis: '[Kleiner Kommentar dazu.]'
    },
    {
      frage: '[Frage 2]',
      antworten: ['[Antwort A]', '[Antwort B]', '[Antwort C]'],
      richtig: 1,
      hinweis: '[Kleiner Kommentar dazu.]'
    },
    {
      frage: '[Frage 3]',
      antworten: ['[Antwort A]', '[Antwort B]', '[Antwort C]', '[Antwort D]'],
      richtig: 2,
      hinweis: '[Kleiner Kommentar dazu.]'
    }
  ];

  const AUSWERTUNG = [
    '[Text bei wenigen Treffern: Wir üben das noch.]',
    '[Text bei vielen Treffern: Fast perfekt.]',
    '[Text bei allen Treffern: Du kennst mich zu gut.]'
  ];

  const box = document.getElementById('quiz');
  if (!box) return;

  let nr = 0;
  let punkte = 0;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function zeigeFrage() {
    const f = FRAGEN[nr];
    box.innerHTML = '';
    box.appendChild(el('p', 'quiz-count', 'Frage ' + (nr + 1) + ' von ' + FRAGEN.length));
    box.appendChild(el('h3', 'quiz-question', f.frage));

    const liste = el('div', 'quiz-answers');
    const note = el('p', 'quiz-note');
    const weiter = el('button', 'quiz-next', nr === FRAGEN.length - 1 ? 'Ergebnis' : 'Weiter');
    weiter.type = 'button';
    weiter.hidden = true;

    f.antworten.forEach(function (text, i) {
      const b = el('button', 'quiz-answer', text);
      b.type = 'button';
      b.addEventListener('click', function () {
        const knoepfe = liste.querySelectorAll('button');
        knoepfe.forEach(function (k) { k.disabled = true; });
        knoepfe[f.richtig].classList.add('is-right');
        if (i === f.richtig) {
          punkte++;
        } else {
          b.classList.add('is-wrong');
        }
        note.textContent = f.hinweis || '';
        weiter.hidden = false;
        weiter.focus();
      });
      liste.appendChild(b);
    });

    box.appendChild(liste);
    box.appendChild(note);
    box.appendChild(weiter);
    weiter.addEventListener('click', function () {
      nr++;
      if (nr < FRAGEN.length) zeigeFrage(); else zeigeErgebnis();
    });
  }

  function zeigeErgebnis() {
    box.innerHTML = '';
    box.appendChild(el('p', 'quiz-count', 'Ergebnis'));
    box.appendChild(el('p', 'quiz-score', punkte + ' / ' + FRAGEN.length));
    const anteil = punkte / FRAGEN.length;
    const stufe = anteil === 1 ? 2 : anteil >= 0.5 ? 1 : 0;
    box.appendChild(el('p', 'quiz-result-text', AUSWERTUNG[stufe]));
    const neu = el('button', 'quiz-restart', 'Nochmal');
    neu.type = 'button';
    neu.addEventListener('click', function () { nr = 0; punkte = 0; zeigeFrage(); });
    box.appendChild(neu);
  }

  zeigeFrage();
})();