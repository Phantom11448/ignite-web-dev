(function() {
  var cv = document.getElementById('flame-canvas');
  var img = document.getElementById('wordmark-img');
  var wrap = document.getElementById('wordmark-wrap');
  var hero = document.getElementById('hero');
  if (!cv || !img || !wrap || !hero) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;

  var ctx = cv.getContext('2d');
  var W = 0, H = 0, DPR = 1, ox = 0, oy = 0, ty = 0, spreadX = 12;
  var navEl = document.querySelector('nav');
  var capY = 0;

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
    oy = r.top + r.height * 0.3541;
    ty = r.top + r.height * 0.1400;
    spreadX = Math.max(4, r.width * 0.047);
    capY = navEl ? navEl.getBoundingClientRect().bottom + 10 : 0;
  }

  size();
  window.addEventListener('resize', size);
  window.addEventListener('scroll', function() {
    measure();
    scrollBoost = Math.min(1, scrollBoost + 0.30);
  }, { passive: true });
  window.addEventListener('orientationchange', function() { setTimeout(size, 140); });
  if (!img.complete) img.addEventListener('load', size);

  var REST = 0.65, SURGE = 6;
  var scrollBoost = 0;
  var parts = [], power = REST, target = REST, MAX = 1200;
  var last = performance.now(), running = true, raf = null;

  wrap.addEventListener('mouseenter', function() { target = SURGE; });
  wrap.addEventListener('mouseleave', function() { target = REST; });

  function spawn(n, pw) {
    for (var i = 0; i < n && parts.length < MAX; i++) {
      var a = (Math.random() - 0.5) * (0.16 + pw * 0.07);
      var sp = (1.5 + Math.random() * 1.6) * (0.7 + pw * 0.30);
      parts.push({
        x: ox + (Math.random() - 0.5) * spreadX,
        y: oy + (Math.random() - 0.5) * 6,
        vx: Math.sin(a) * sp * 0.5,
        vy: -Math.abs(Math.cos(a)) * sp - 1.2,
        life: 1,
        decay: (0.010 + Math.random() * 0.013) / (0.5 + pw * 0.36),
        r: 0.6 + Math.random() * (1.4 + pw * 0.45),
        seed: Math.random() * 6.28
      });
    }
  }

  function tick(now) {
    var dt = Math.min((now - last) / 16.67, 3);
    last = now;
    scrollBoost *= Math.pow(0.93, dt);
    if (scrollBoost < 0.001) scrollBoost = 0;
    power += ((target + scrollBoost * 2.2) - power) * 0.045 * dt;
    ctx.clearRect(0, 0, W, H);

    var pulse = 0.55 + Math.sin(now / 560) * 0.10;
    var rad = 54 + power * 74;
    var g = ctx.createRadialGradient(ox, oy + 26, 3, ox, oy + 26, rad);
    g.addColorStop(0, 'rgba(47,127,255,' + (0.10 * pulse * (0.5 + power * 0.5)).toFixed(3) + ')');
    g.addColorStop(0.45, 'rgba(47,127,255,' + (0.035 * pulse * (0.5 + power * 0.5)).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(47,127,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    spawn(Math.max(1, Math.round(power * 4)), power);

    ctx.globalCompositeOperation = 'lighter';
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.vy -= 0.010 * dt;
      p.vx += (ox - p.x) * 0.0020 * dt;
      p.vx += Math.sin(now / 320 + p.seed) * 0.02 * dt;
      p.vx *= Math.pow(0.975, dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y < capY + 80) {
        var over = Math.min(1, (capY + 80 - p.y) / 80);
        p.life -= over * over * 0.11 * dt;
        p.vy *= Math.pow(0.90, over * dt);
      }
      p.life -= p.decay * dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      var a = p.life;
      var col = a > 0.74 ? '235,245,255' : (a > 0.42 ? '120,180,255' : '47,127,255');
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * a * a * 1.6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + col + ',' + (a * a * 0.55).toFixed(3) + ')';
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    if (running) raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  var heroObs = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting && !running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(tick);
      } else if (!entry.isIntersecting && running) {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        ctx.clearRect(0, 0, W, H);
        parts.length = 0;
        power = REST;
        target = REST;
      }
    });
  }, { threshold: 0 });
  heroObs.observe(hero);
})();