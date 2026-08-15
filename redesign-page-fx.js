/* Sub-page motion. Loaded on work / approach / faq / contact only.
   Every block is its own IIFE so a failure in one cannot kill the rest. */

/* --- 1. ambient cursor glow --- */
(function() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!document.body.classList.contains('subpage')) return;
  var g = document.createElement('div');
  g.id = 'page-glow';
  document.body.appendChild(g);
  var tx = window.innerWidth / 2, ty = window.innerHeight / 2, cx = tx, cy = ty, on = false;
  window.addEventListener('pointermove', function(e) {
    tx = e.clientX; ty = e.clientY;
    if (!on) { on = true; document.body.classList.add('glow-on'); }
  }, { passive: true });
  (function loop() {
    cx += (tx - cx) * 0.09;
    cy += (ty - cy) * 0.09;
    g.style.transform = 'translate(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px)';
    requestAnimationFrame(loop);
  })();
})();

/* --- 2. scroll reveal, replays on every entry --- */
(function() {
  var sel = '.sc-row, .step-row, .page-section .faq-item, .next-steps, .contact-form, .contact-direct, .page-cta h2, .page-cta p, .page-cta .cta-btn';
  var els = Array.prototype.slice.call(document.querySelectorAll(sel));
  if (!els.length) return;
  els.forEach(function(el, i) {
    el.classList.add('reveal');
    el.style.transitionDelay = ((i % 8) * 0.07).toFixed(2) + 's';
  });
  var obs = new IntersectionObserver(function(entries) {
    entries.forEach(function(en) {
      if (en.isIntersecting) en.target.classList.add('in');
      else en.target.classList.remove('in');
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  els.forEach(function(el) { obs.observe(el); });
})();

/* --- 3. page title: canvas particle disintegration --- */
(function() {
  var h = document.querySelector('.page-title');
  if (!h) return;
  var TEXT = h.textContent.trim();
  if (!TEXT) return;

  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var canvas = document.createElement('canvas');
  canvas.className = 'pt-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  h.appendChild(canvas);
  h.classList.add('particle-on');
  var ctx = canvas.getContext('2d');

  var pts = [], CW = 0, CH = 0, DPR = 1, raf = null, running = false, start = null;

  function wrap(octx, text, maxW) {
    var words = text.split(' '), lines = [], line = '';
    words.forEach(function(w) {
      var test = line ? line + ' ' + w : w;
      if (octx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
      else { line = test; }
    });
    if (line) lines.push(line);
    return lines;
  }

  function build() {
    var cs = getComputedStyle(h);
    var fs = parseFloat(cs.fontSize) || 40;
    var lh = parseFloat(cs.lineHeight);
    if (!lh || isNaN(lh)) lh = fs * 1.06;
    var font = (cs.fontWeight || 800) + ' ' + fs + 'px ' + cs.fontFamily;
    CW = Math.max(80, h.clientWidth);
    DPR = Math.min(window.devicePixelRatio || 1, 2);

    var off = document.createElement('canvas');
    var octx = off.getContext('2d');
    octx.font = font;
    var lines = wrap(octx, TEXT, CW - 4);
    CH = Math.ceil(lines.length * lh + fs * 0.35);

    off.width = Math.floor(CW * DPR);
    off.height = Math.floor(CH * DPR);
    octx.setTransform(DPR, 0, 0, DPR, 0, 0);
    octx.font = font;
    octx.fillStyle = '#fff';
    octx.textBaseline = 'alphabetic';
    lines.forEach(function(ln, i) {
      octx.fillText(ln, 0, lh * (i + 1) - lh * 0.24);
    });

    canvas.width = Math.floor(CW * DPR);
    canvas.height = Math.floor(CH * DPR);
    canvas.style.width = CW + 'px';
    canvas.style.height = CH + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    h.style.minHeight = CH + 'px';

    var step = Math.max(2, Math.round(fs / 18));
    var data = octx.getImageData(0, 0, off.width, off.height).data;
    pts = [];
    for (var y = 0; y < CH; y += step) {
      for (var x = 0; x < CW; x += step) {
        var px = Math.floor(x * DPR), py = Math.floor(y * DPR);
        if (data[(py * off.width + px) * 4 + 3] > 128) {
          pts.push({ tx: x, ty: y, x: 0, y: 0, d: Math.random() });
        }
      }
    }
    return step;
  }

  var SIZE = build();

  function draw(t) {
    if (start === null) start = t;
    var prog = Math.min(1, (t - start) / 1500);
    ctx.clearRect(0, 0, CW, CH);
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      var local = Math.min(1, Math.max(0, (prog - p.d * 0.32) / 0.68));
      var e = 1 - Math.pow(1 - local, 3);
      var cx = p.x + (p.tx - p.x) * e;
      var cy = p.y + (p.ty - p.y) * e;
      if (e < 0.55) {
        ctx.fillStyle = 'rgba(47,127,255,' + (0.35 + e).toFixed(3) + ')';
      } else {
        ctx.fillStyle = 'rgba(255,255,255,' + (0.55 + e * 0.45).toFixed(3) + ')';
      }
      ctx.fillRect(cx, cy, SIZE, SIZE);
    }
    if (prog < 1) { raf = requestAnimationFrame(draw); }
    else { running = false; }
  }

  function play() {
    if (running) return;
    running = true;
    for (var i = 0; i < pts.length; i++) {
      pts[i].x = Math.random() * CW;
      pts[i].y = Math.random() * CH;
    }
    start = null;
    raf = requestAnimationFrame(draw);
  }

  var obs = new IntersectionObserver(function(entries) {
    entries.forEach(function(en) { if (en.isIntersecting) play(); });
  }, { threshold: 0.35 });
  obs.observe(h);

  var rt = null;
  window.addEventListener('resize', function() {
    clearTimeout(rt);
    rt = setTimeout(function() {
      if (raf) cancelAnimationFrame(raf);
      running = false;
      SIZE = build();
      play();
    }, 200);
  });
})();

/* --- 4. showcase: cursor-following preview (desktop) / in-tile media (mobile) --- */
(function() {
  var wrap = document.getElementById('showcase');
  if (!wrap) return;
  var rows = Array.prototype.slice.call(wrap.querySelectorAll('.sc-row'));
  if (!rows.length) return;

  var desktop = window.matchMedia('(min-width: 901px)');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var vidObs = new IntersectionObserver(function(entries) {
    entries.forEach(function(en) {
      var v = en.target;
      if (en.isIntersecting) { v.play().catch(function(){}); }
      else { v.pause(); }
    });
  }, { threshold: 0.25 });

  function bindMobile() {
    rows.forEach(function(r) {
      var v = r.querySelector('video');
      if (v) { v.preload = 'auto'; vidObs.observe(v); }
    });
  }
  function unbindMobile() {
    rows.forEach(function(r) {
      var v = r.querySelector('video');
      if (v) { vidObs.unobserve(v); v.pause(); }
    });
  }

  var tx = 0, ty = 0, cx = 0, cy = 0, active = null, raf = null;
  function follow() {
    cx += (tx - cx) * 0.16;
    cy += (ty - cy) * 0.16;
    if (active) {
      active.style.left = cx.toFixed(1) + 'px';
      active.style.top  = cy.toFixed(1) + 'px';
    }
    raf = requestAnimationFrame(follow);
  }

  function bindDesktop() {
    rows.forEach(function(r) {
      var media = r.querySelector('.sc-media');
      var v = r.querySelector('video');
      if (!media) return;
      r.addEventListener('mouseenter', function(e) {
        wrap.classList.add('hot');
        media.classList.add('on');
        active = media;
        /* seed the position from this event so the card never sits at 0,0
           while waiting for the first mousemove */
        tx = cx = e.clientX; ty = cy = e.clientY;
        media.style.left = cx + 'px';
        media.style.top  = cy + 'px';
        if (!raf) raf = requestAnimationFrame(follow);
        if (v) { v.currentTime = 0; v.play().catch(function(){}); }
      });
      r.addEventListener('mouseleave', function() {
        media.classList.remove('on');
        if (active === media) active = null;
        if (v) v.pause();
      });
    });
    wrap.addEventListener('mouseleave', function() { wrap.classList.remove('hot'); });
    wrap.addEventListener('mousemove', function(e) {
      tx = e.clientX; ty = e.clientY;
      if (!raf) { cx = tx; cy = ty; raf = requestAnimationFrame(follow); }
    });
  }

  function apply() {
    if (desktop.matches && !reduce) { unbindMobile(); }
    else { bindMobile(); }
  }
  if (!reduce) bindDesktop();
  apply();
  if (desktop.addEventListener) desktop.addEventListener('change', apply);
})();

/* --- 5. approach: ghost numbers with scroll parallax --- */
(function() {
  var rows = Array.prototype.slice.call(document.querySelectorAll('.step-row'));
  if (!rows.length) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ghosts = [];
  rows.forEach(function(row) {
    var num = row.querySelector('.step-num');
    if (!num) return;
    var g = document.createElement('div');
    g.className = 'step-ghost';
    g.textContent = num.textContent.trim();
    row.appendChild(g);
    ghosts.push({ el: g, row: row });
  });
  if (reduce || !ghosts.length) return;
  var ticking = false;
  function update() {
    var vh = window.innerHeight;
    ghosts.forEach(function(o) {
      var r = o.row.getBoundingClientRect();
      var p = (r.top + r.height / 2 - vh / 2) / vh;
      o.el.style.transform = 'translateY(' + (-50 + p * -34).toFixed(1) + '%)';
    });
    ticking = false;
  }
  window.addEventListener('scroll', function() {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  update();
})();

/* --- 6. bottom CTA heading: per-letter wave on hover --- */
(function() {
  var h = document.querySelector('.page-cta h2');
  if (!h) return;
  var text = h.textContent;
  h.textContent = '';
  text.split('').forEach(function(ch, i) {
    var s = document.createElement('span');
    s.className = 'cta-letter';
    s.textContent = ch === ' ' ? '\u00A0' : ch;
    s.style.transitionDelay = (i * 0.028).toFixed(3) + 's';
    h.appendChild(s);
  });
})();