/* Nav: letters catch fire on hover + scramble-resolve.
   Flames are emitted from the TOP EDGE OF EACH GLYPH, sampled from the
   rendered text, so fire follows the letterforms instead of rising out of
   a rectangle behind them. */
(function() {
  var nav = document.querySelector('nav');
  if (!nav) return;
  var links = nav.querySelectorAll('ul a');
  if (!links.length) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var cv = document.getElementById('nav-spark-canvas');
  if (cv) {
    var ctx = cv.getContext('2d');
    var DPR = 1, P = [], hot = null, running = false, edgeCache = null, hotEl = null;

    function size() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      var w = nav.clientWidth, h = nav.clientHeight;
      cv.width = Math.floor(w * DPR); cv.height = Math.floor(h * DPR);
      cv.style.width = w + 'px'; cv.style.height = h + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      edgeCache = null;
    }
    size();
    window.addEventListener('resize', size);

    /* render the link's text offscreen and find the top ink pixel per column */
    function edgesFor(a) {
      var r = a.getBoundingClientRect(), nr = nav.getBoundingClientRect();
      var w = Math.ceil(r.width), h = Math.ceil(r.height);
      if (w < 4 || h < 4) return [];
      var off = document.createElement('canvas');
      off.width = w; off.height = h;
      var o = off.getContext('2d');
      var cs = getComputedStyle(a);
      o.font = (cs.fontWeight || 500) + ' ' + parseFloat(cs.fontSize) + 'px ' + cs.fontFamily;
      o.fillStyle = '#fff';
      o.textBaseline = 'middle';
      var ls = parseFloat(cs.letterSpacing);
      if (ls && !isNaN(ls) && o.letterSpacing !== undefined) o.letterSpacing = ls + 'px';
      o.fillText(a.textContent, 0, h / 2);
      var d;
      try { d = o.getImageData(0, 0, w, h).data; } catch (e) { return []; }
      var out = [], ox = r.left - nr.left, oy = r.top - nr.top;
      for (var x = 0; x < w; x += 2) {
        for (var y = 0; y < h; y++) {
          if (d[(y * w + x) * 4 + 3] > 130) { out.push([ox + x, oy + y]); break; }
        }
      }
      return out;
    }

    function start() { if (!running) { running = true; requestAnimationFrame(tick); } }

    Array.prototype.forEach.call(links, function(a) {
      a.addEventListener('mouseenter', function() {
        hotEl = a; edgeCache = edgesFor(a); hot = true;
        a.classList.add('burning');
        start();
      });
      a.addEventListener('mouseleave', function() {
        if (hotEl === a) { hot = false; hotEl = null; edgeCache = null; }
        a.classList.remove('burning');
      });
    });

    function tick(now) {
      var w = nav.clientWidth, h = nav.clientHeight;
      ctx.clearRect(0, 0, w, h);

      if (hot && edgeCache && edgeCache.length) {
        for (var k = 0; k < 9 && P.length < 460; k++) {
          var e = edgeCache[(Math.random() * edgeCache.length) | 0];
          P.push({
            x: e[0] + (Math.random() - 0.5) * 3,
            y: e[1] + 1,
            vx: (Math.random() - 0.5) * 0.22,
            vy: -(0.55 + Math.random() * 0.95),
            l: 1,
            d: 0.024 + Math.random() * 0.026,
            r: 2.6 + Math.random() * 3.4,
            s: Math.random() * 6.283
          });
        }
      }

      ctx.globalCompositeOperation = 'lighter';
      for (var i = P.length - 1; i >= 0; i--) {
        var p = P[i];
        p.vy -= 0.020;
        p.vx += Math.sin(now / 320 + p.s) * 0.022;
        p.vx *= 0.985;
        p.x += p.vx; p.y += p.vy; p.l -= p.d;
        if (p.l <= 0 || p.y < -20) { P.splice(i, 1); continue; }

        var a2 = p.l, rad = p.r * Math.pow(a2, 0.62);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.sin(now / 400 + p.s) * 0.20);
        var g = ctx.createRadialGradient(0, -rad * 0.55, rad * 0.06, 0, -rad * 0.55, rad * 1.95);
        g.addColorStop(0.00, 'rgba(236,246,255,' + (a2 * 0.62).toFixed(3) + ')');
        g.addColorStop(0.28, 'rgba(140,195,255,' + (a2 * 0.50).toFixed(3) + ')');
        g.addColorStop(0.62, 'rgba(47,127,255,'  + (a2 * 0.38).toFixed(3) + ')');
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

      if (!hot && P.length === 0) { running = false; return; }
      requestAnimationFrame(tick);
    }
  }

})();