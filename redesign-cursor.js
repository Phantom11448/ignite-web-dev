/* Torch cursor — the pointer is a flame. Desktop pointers only.
   Wrapped so any failure restores the native cursor instead of hiding it. */
(function() {
  try {
    if (!window.matchMedia) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var cv = document.createElement('canvas');
    cv.id = 'torch-cursor-canvas';
    cv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cv);
    var ctx = cv.getContext('2d');
    if (!ctx) return;

    document.documentElement.classList.add('torch-cursor');

    var W = 0, H = 0, DPR = 1;
    function size() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      cv.width = Math.floor(W * DPR); cv.height = Math.floor(H * DPR);
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    size();
    window.addEventListener('resize', size);

    var x = -999, y = -999, on = false, down = 0;
    var inPanel = false, panel = 0, hitQueued = false;   /* 0 = outside the hero panel, 1 = inside */
    var parts = [], MAX = 150, last = performance.now();

    document.addEventListener('pointermove', function(e) {
      x = e.clientX; y = e.clientY; on = true;
      /* elementFromPoint respects the panel's clip-path, unlike a rect test.
         The canvas is pointer-events:none so it never reports itself. */
      if (!hitQueued) {
        hitQueued = true;
        requestAnimationFrame(function() {
          hitQueued = false;
          var el = document.elementFromPoint(x, y);
          inPanel = !!(el && el.closest && el.closest('.hero-panel'));
        });
      }
    }, { passive: true });
    document.addEventListener('pointerdown', function() { down = 1; });
    window.addEventListener('blur', function() { on = false; });
    document.addEventListener('mouseleave', function() { on = false; });

    function tick(now) {
      var dt = Math.min((now - last) / 16.67, 3);
      last = now;
      down *= Math.pow(0.88, dt);
      if (down < 0.001) down = 0;
      panel += ((inPanel && on ? 1 : 0) - panel) * 0.10 * dt;
      if (panel < 0.001) panel = 0;

      ctx.clearRect(0, 0, W, H);

      if (on) {
        var n = Math.round(6 + down * 10 + panel * 11);
        for (var k = 0; k < n && parts.length < MAX; k++) {
          parts.push({
            x: x + (Math.random() - 0.5) * 7,
            y: y + (Math.random() - 0.5) * 5,
            vx: (Math.random() - 0.5) * 0.5,
            vy: -(1.1 + Math.random() * 1.3) * (1 + down * 0.6),
            l: 1,
            d: 0.042 + Math.random() * 0.032,
            r: (3.4 + Math.random() * 4.4) * (1 + down * 0.3) * (1 + panel * 0.75),
            s: Math.random() * 6.283
          });
        }
      }

      ctx.globalCompositeOperation = 'lighter';
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        p.vy -= 0.05 * dt;
        p.vx += (x - p.x) * 0.055 * dt;
        p.vy += (y - p.y) * 0.012 * dt;
        p.vx += Math.sin(now / 300 + p.s) * 0.05 * dt;
        p.vx *= Math.pow(0.90, dt);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.l -= p.d * dt;
        if (p.l <= 0) { parts.splice(i, 1); continue; }

        var a = p.l, rad = p.r * Math.pow(a, 0.55);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.sin(now / 380 + p.s) * 0.30);
        var g = ctx.createLinearGradient(0, rad * 1.1, 0, -rad * 2.4);
        var amp = 1 + panel * 1.9;
        g.addColorStop(0.00, 'rgba(47,127,255,'  + Math.min(1, a * 0.55 * amp).toFixed(3) + ')');
        g.addColorStop(0.45, 'rgba(140,195,255,' + Math.min(1, a * 0.46 * amp).toFixed(3) + ')');
        g.addColorStop(1.00, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-rad * 0.5, rad);
        ctx.quadraticCurveTo(-rad * 0.48, -rad * 0.6, 0, -rad * 2.35);
        ctx.quadraticCurveTo(rad * 0.48, -rad * 0.6, rad * 0.5, rad);
        ctx.quadraticCurveTo(0, rad * 1.45, -rad * 0.5, rad);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  } catch (err) {
    document.documentElement.classList.remove('torch-cursor');
    var c = document.getElementById('torch-cursor-canvas');
    if (c && c.parentNode) c.parentNode.removeChild(c);
  }
})();