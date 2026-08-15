/* Embers lifting off the hero headline. Overlays #hero-heading on its own
   canvas — the heading's text and its cursor-reactive extrusion are untouched. */
(function() {
  var h     = document.getElementById('hero-heading');
  var panel = h && h.closest('.hero-panel');
  var hero  = document.getElementById('hero');
  if (!h || !panel || !hero) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var TEXT = h.textContent.trim();
  if (!TEXT) return;

  var cv = document.createElement('canvas');
  cv.className = 'hero-ember-canvas';
  cv.setAttribute('aria-hidden', 'true');
  panel.appendChild(cv);
  var ctx = cv.getContext('2d');

  var ink = [], W = 0, H = 0, DPR = 1;
  var parts = [], MAX = 300, last = performance.now();
  var boost = 0, running = true, raf = null;

  function build() {
    var hr = h.getBoundingClientRect(), pr = panel.getBoundingClientRect();
    W = Math.ceil(hr.width); H = Math.ceil(hr.height);
    if (W < 40 || H < 20) return;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    cv.style.left = (hr.left - pr.left) + 'px';
    cv.style.top  = (hr.top  - pr.top)  + 'px';
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    cv.width = Math.floor(W * DPR); cv.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    var cs = getComputedStyle(h);
    var fs = parseFloat(cs.fontSize) || 40;
    var lh = parseFloat(cs.lineHeight); if (!lh || isNaN(lh)) lh = fs * 1.06;
    var off = document.createElement('canvas');
    off.width = W; off.height = H;
    var o = off.getContext('2d');
    o.font = (cs.fontWeight || 800) + ' ' + fs + 'px ' + cs.fontFamily;
    o.fillStyle = '#fff'; o.textBaseline = 'alphabetic';
    var words = TEXT.split(' '), line = '', lines = [];
    words.forEach(function(wd) {
      var t = line ? line + ' ' + wd : wd;
      if (o.measureText(t).width > W - 2 && line) { lines.push(line); line = wd; }
      else { line = t; }
    });
    if (line) lines.push(line);
    lines.forEach(function(ln, i) { o.fillText(ln, 0, lh * (i + 1) - lh * 0.26); });

    var d = o.getImageData(0, 0, W, H).data;
    ink = [];
    /* only the TOP edge of each glyph: ink here, empty 3px above.
       Emitting from every ink pixel puts embers inside the letters. */
    for (var y = 2; y < H; y += 2) {
      for (var x = 0; x < W; x += 2) {
        var here  = d[(y * W + x) * 4 + 3] > 140;
        var above = d[((y - 2) * W + x) * 4 + 3] > 140;
        if (here && !above) ink.push([x, y]);
      }
    }
  }
  build();

  var rt = null;
  window.addEventListener('resize', function() {
    clearTimeout(rt); rt = setTimeout(build, 180);
  });

  panel.addEventListener('mouseenter', function() { boost = 1; });
  panel.addEventListener('mouseleave', function() { boost = 0.15; });
  panel.addEventListener('click', function() { boost = 1; });
  window.addEventListener('scroll', function() {
    boost = Math.min(1, boost + 0.40);
  }, { passive: true });

  function spawn(n) {
    if (!ink.length) return;
    for (var i = 0; i < n && parts.length < MAX; i++) {
      var s = ink[(Math.random() * ink.length) | 0];
      parts.push({
        x: s[0], y: s[1] - 1,
        vx: (Math.random() - 0.5) * 0.26,
        vy: -(0.85 + Math.random() * 1.15),
        life: 1,
        decay: 0.015 + Math.random() * 0.016,
        r: 2.9 + Math.random() * 4.3,
        seed: Math.random() * 6.283
      });
    }
  }

  function tick(now) {
    var dt = Math.min((now - last) / 16.67, 3);
    last = now;
    if (boost > 0) boost = Math.max(0, boost - 0.007 * dt);
    ctx.clearRect(0, 0, W, H);
    spawn(Math.round(3 + boost * 9));

    ctx.globalCompositeOperation = 'lighter';
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.vy -= 0.022 * dt;
      p.vx += Math.sin(now / 380 + p.seed) * 0.022 * dt;
      p.vx *= Math.pow(0.985, dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= p.decay * dt;
      if (p.life <= 0 || p.y < -30) { parts.splice(i, 1); continue; }

      var a = p.life, rad = p.r * Math.pow(a, 0.6);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.sin(now / 420 + p.seed) * 0.16);
      var g = ctx.createLinearGradient(0, rad * 1.1, 0, -rad * 2.3);
      g.addColorStop(0.00, 'rgba(47,127,255,'  + (a * 0.66).toFixed(3) + ')');
      g.addColorStop(0.45, 'rgba(140,195,255,' + (a * 0.58).toFixed(3) + ')');
      g.addColorStop(1.00, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-rad * 0.5, rad * 1.0);
      ctx.quadraticCurveTo(-rad * 0.48, -rad * 0.6, 0, -rad * 2.3);
      ctx.quadraticCurveTo(rad * 0.48, -rad * 0.6, rad * 0.5, rad * 1.0);
      ctx.quadraticCurveTo(0, rad * 1.45, -rad * 0.5, rad * 1.0);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
    if (running) raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  new IntersectionObserver(function(entries) {
    entries.forEach(function(en) {
      if (en.isIntersecting && !running) {
        running = true; last = performance.now(); raf = requestAnimationFrame(tick);
      } else if (!en.isIntersecting && running) {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        ctx.clearRect(0, 0, W, H);
        parts.length = 0; boost = 0;
      }
    });
  }, { threshold: 0 }).observe(hero);
})();