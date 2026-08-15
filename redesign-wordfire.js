/* Flames licking off the top edges of the IGNITE letters.
   Canvas sits BEHIND the artwork at full opacity, so the letters stay solid
   in front and fire is only visible in the transparent space above them. */
(function() {
  var wrap = document.getElementById('wordmark-wrap');
  var img  = document.getElementById('wordmark-img');
  var hero = document.getElementById('hero');
  if (!wrap || !img || !hero) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var cv = document.createElement('canvas');
  cv.className = 'wordmark-fire';
  cv.setAttribute('aria-hidden', 'true');
  wrap.insertBefore(cv, img);
  var ctx = cv.getContext('2d');

  var W = 0, H = 0, DPR = 1, edges = [], EXTRA = 0, CH = 0;
  var parts = [], MAX = 620, last = performance.now();
  var boost = 0, hovering = false, running = true, raf = null;

  function build() {
    var r = img.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
    W = Math.ceil(r.width); H = Math.ceil(r.height);
    if (W < 40 || H < 20 || !img.naturalWidth) return;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    EXTRA = Math.round(H * 1.15);
    CH = H + EXTRA;
    cv.style.left = (r.left - wr.left) + 'px';
    cv.style.top  = (r.top  - wr.top - EXTRA) + 'px';
    cv.style.width = W + 'px'; cv.style.height = CH + 'px';
    cv.width = Math.floor(W * DPR); cv.height = Math.floor(CH * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    /* rasterise the artwork at render size and find top-edge pixels */
    var off = document.createElement('canvas');
    off.width = W; off.height = H;
    var o = off.getContext('2d');
    try { o.drawImage(img, 0, 0, W, H); } catch (e) { return; }
    var d;
    try { d = o.getImageData(0, 0, W, H).data; } catch (e) { return; }

    edges = [];
    var skip = W * 0.215;              /* the torch already burns; skip the "I" */
    for (var x = Math.ceil(skip); x < W; x += 7) {
      for (var y = 2; y < H; y += 2) {
        var here  = d[(y * W + x) * 4 + 3] > 140;
        var above = d[((y - 2) * W + x) * 4 + 3] > 140;
        if (here && !above) { edges.push([x, y + EXTRA]); break; }
      }
    }
  }
  build();
  if (!img.complete) img.addEventListener('load', build);
  var rt = null;
  window.addEventListener('resize', function() { clearTimeout(rt); rt = setTimeout(build, 180); });

  wrap.addEventListener('mouseenter', function() { hovering = true; });
  wrap.addEventListener('mouseleave', function() { hovering = false; });
  window.addEventListener('scroll', function() {
    boost = Math.min(1, boost + 0.30);
  }, { passive: true });

  function spawn(n) {
    if (!edges.length) return;
    for (var i = 0; i < n && parts.length < MAX; i++) {
      var e = edges[(Math.random() * edges.length) | 0];
      parts.push({
        x: e[0] + (Math.random() - 0.5) * 5,
        y: e[1] + 2,
        vx: (Math.random() - 0.5) * 0.30,
        vy: -(0.85 + Math.random() * 1.25) * (1 + boost * 0.5),
        life: 1,
        decay: 0.0125 + Math.random() * 0.0130,
        r: (H * 0.075) * (0.42 + Math.random() * 0.52) * (0.62 + boost * 0.62),
        seed: Math.random() * 6.283
      });
    }
  }

  function tick(now) {
    var dt = Math.min((now - last) / 16.67, 3);
    last = now;
    if (hovering) boost = Math.min(1, boost + 0.055 * dt);
    else if (boost > 0) boost = Math.max(0, boost - 0.020 * dt);

    ctx.clearRect(0, 0, W, CH);
    spawn(Math.round(8 + boost * 18));

    ctx.globalCompositeOperation = 'lighter';
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.vy -= 0.020 * dt;
      p.vx += Math.sin(now / 340 + p.seed) * 0.026 * dt;
      p.vx *= Math.pow(0.984, dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= p.decay * dt;
      if (p.life <= 0 || p.y < -30) { parts.splice(i, 1); continue; }

      var a = p.life, rad = p.r * Math.pow(a, 0.62);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.sin(now / 400 + p.seed) * 0.24);
      var g = ctx.createRadialGradient(0, -rad * 0.55, rad * 0.06, 0, -rad * 0.55, rad * 1.95);
      g.addColorStop(0.00, 'rgba(226,240,255,' + (a * (0.16 + boost * 0.50)).toFixed(3) + ')');
      g.addColorStop(0.28, 'rgba(140,195,255,' + (a * (0.14 + boost * 0.42)).toFixed(3) + ')');
      g.addColorStop(0.62, 'rgba(47,127,255,'  + (a * (0.11 + boost * 0.34)).toFixed(3) + ')');
      g.addColorStop(1.00, 'rgba(47,127,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-rad * 0.62, rad * 1.15);
      ctx.quadraticCurveTo(-rad * 0.58, -rad * 0.6, 0, -rad * 2.5);
      ctx.quadraticCurveTo(rad * 0.58, -rad * 0.6, rad * 0.62, rad * 1.15);
      ctx.quadraticCurveTo(0, rad * 1.7, -rad * 0.62, rad * 1.15);
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