/* Torch flame — tapered tongues, reactive to hover, cursor proximity,
   scroll, and click. Bails entirely under prefers-reduced-motion. */
(function() {
  var cv    = document.getElementById('flame-canvas');
  var img   = document.getElementById('wordmark-img');
  var wrap  = document.getElementById('wordmark-wrap');
  var hero  = document.getElementById('hero');
  if (!cv || !img || !wrap || !hero) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var ctx = cv.getContext('2d');
  var W = 0, H = 0, DPR = 1, ox = 0, oy = 0, ty = 0, spreadX = 12, baseR = 9;
  var navEl = document.querySelector('nav'), capY = 0;
  var kicker = document.getElementById('heroKicker') || document.querySelector('.kicker');

  function size() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.floor(W * DPR); cv.height = Math.floor(H * DPR);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    measure();
  }
  function measure() {
    var r = img.getBoundingClientRect();
    ox = r.left + r.width * 0.1696;
    oy = r.top  + r.height * 0.3541;
    ty = r.top  + r.height * 0.1400;
    spreadX = Math.max(4, r.width * 0.047);
    baseR = Math.max(4, r.height * 0.075);
    var navBottom = navEl ? navEl.getBoundingClientRect().bottom + 10 : 0;
    var kickBottom = kicker ? kicker.getBoundingClientRect().bottom : 0;
    capY = Math.max(navBottom, kickBottom);
  }
  size();
  window.addEventListener('resize', size);
  if (!img.complete) img.addEventListener('load', size);
  window.addEventListener('orientationchange', function() { setTimeout(size, 140); });

  /* ---------------- reactive state ---------------- */
  var REST = 0.30, SURGE = 8;
  var target = REST, power = REST;
  var scrollBoost = 0, clickBoost = 0, prox = 0, lean = 0, leanTarget = 0;
  var mx = -9999, my = -9999, haveMouse = false;

  wrap.addEventListener('mouseenter', function() { target = SURGE; });
  wrap.addEventListener('mouseleave', function() { target = REST; });

  hero.addEventListener('pointermove', function(e) {
    mx = e.clientX; my = e.clientY; haveMouse = true;
  }, { passive: true });
  hero.addEventListener('pointerleave', function() { haveMouse = false; });

  hero.addEventListener('click', function() { clickBoost = 1; });

  var measureQueued = false;
  window.addEventListener('scroll', function() {
    scrollBoost = Math.min(1, scrollBoost + 0.30);
    if (!measureQueued) {
      measureQueued = true;
      requestAnimationFrame(function() { measureQueued = false; measure(); });
    }
  }, { passive: true });

  /* ---------------- particles ---------------- */
  var parts = [], MAX = 340, last = performance.now();
  var running = true, raf = null;

  function spawn(n, pw) {
    for (var i = 0; i < n && parts.length < MAX; i++) {
      var a  = (Math.random() - 0.5) * (0.20 + pw * 0.10);
      var sp = (1.1 + Math.random() * 1.3) * (0.7 + pw * 0.16);
      parts.push({
        x: ox + (Math.random() - 0.5) * spreadX,
        y: oy + (Math.random() - 0.5) * 6,
        vx: Math.sin(a) * sp * 0.45,
        vy: -Math.abs(Math.cos(a)) * sp - 0.65,
        life: 1,
        decay: (0.0150 + Math.random() * 0.0195) / (0.55 + pw * 0.20),
        r: baseR * (0.42 + Math.random() * 0.52) * (0.62 + pw * 0.085),
        seed: Math.random() * 6.283,
        cj: Math.random()
      });
    }
  }

  function tongue(p, t, lvl) {
    var a = p.life;
    var rad = p.r * Math.pow(a, 0.62);
    if (rad < 0.4) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.sin(t * 0.0022 + p.seed) * 0.30 + lean * 0.5);
    var g = ctx.createRadialGradient(0, -rad * 0.55, rad * 0.06, 0, -rad * 0.55, rad * 1.95);
    g.addColorStop(0.00, 'rgba(226,240,255,' + (a * (0.16 + lvl * 0.50)).toFixed(3) + ')');
    g.addColorStop(0.28, 'rgba(140,195,255,' + (a * (0.14 + lvl * 0.42)).toFixed(3) + ')');
    g.addColorStop(0.62, 'rgba(47,127,255,'  + (a * (0.11 + lvl * 0.34)).toFixed(3) + ')');
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

  function tick(now) {
    var dt = Math.min((now - last) / 16.67, 3);
    last = now;

    /* proximity: 1 when the cursor is on the torch, 0 beyond ~420px */
    if (haveMouse) {
      var d = Math.hypot(mx - ox, my - oy);
      prox += (Math.max(0, 1 - d / 420) - prox) * 0.08 * dt;
      leanTarget = Math.max(-1, Math.min(1, (mx - ox) / 320)) * prox;
    } else {
      prox += (0 - prox) * 0.05 * dt;
      leanTarget = 0;
    }
    lean += (leanTarget - lean) * 0.05 * dt;

    scrollBoost *= Math.pow(0.93, dt);
    clickBoost  *= Math.pow(0.90, dt);
    if (scrollBoost < 0.001) scrollBoost = 0;
    if (clickBoost  < 0.001) clickBoost  = 0;

    var goal = target + scrollBoost * 2.2 + clickBoost * 3.4 + prox * 1.9;
    power += (goal - power) * 0.045 * dt;

    ctx.clearRect(0, 0, W, H);

    var pulse = 0.55 + Math.sin(now / 560) * 0.10;
    var rad = 54 + power * 74;
    var g = ctx.createRadialGradient(ox + lean * 26, ty, 3, ox + lean * 26, ty, rad);
    g.addColorStop(0,    'rgba(47,127,255,' + (0.11 * pulse * (0.5 + power * 0.5)).toFixed(3) + ')');
    g.addColorStop(0.45, 'rgba(47,127,255,' + (0.04 * pulse * (0.5 + power * 0.5)).toFixed(3) + ')');
    g.addColorStop(1,    'rgba(47,127,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    var lvl = Math.max(0, Math.min(1, (power - REST) / (SURGE - REST)));
    spawn(Math.max(1, Math.round(1 + power * 1.7)), power);

    ctx.globalCompositeOperation = 'lighter';
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.vy -= 0.013 * dt;
      p.vx += lean * 0.075 * dt;
      p.vx += Math.sin(now / 340 + p.seed) * 0.030 * dt;
      p.vx += (ox - p.x) * 0.0022 * (1 - Math.abs(lean) * 0.6) * dt;
      p.vx *= Math.pow(0.982, dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      var band = 170 + p.cj * 130;
      var myCap = capY - p.cj * 80;
      if (p.y < myCap + band) {
        var over = Math.min(1, (myCap + band - p.y) / band);
        p.life -= over * over * over * 0.055 * dt;
        p.vy *= Math.pow(0.955, over * dt);
      }
      p.life -= p.decay * dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      tongue(p, now, lvl);
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
        parts.length = 0;
        power = REST; target = REST;
        scrollBoost = clickBoost = prox = lean = 0;
      }
    });
  }, { threshold: 0 }).observe(hero);
})();