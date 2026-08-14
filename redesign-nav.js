(function() {
  var nav = document.querySelector('nav');
  if (!nav) return;
  var links = nav.querySelectorAll('ul a');
  if (!links.length) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var cv = document.getElementById('nav-spark-canvas');
  if (cv) {
    var ctx = cv.getContext('2d');
    var DPR = 1, P = [], hot = null, running = false;

    function size() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      var w = nav.clientWidth, h = nav.clientHeight;
      cv.width = Math.floor(w * DPR);
      cv.height = Math.floor(h * DPR);
      cv.style.width = w + 'px';
      cv.style.height = h + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    size();
    window.addEventListener('resize', size);

    function start() {
      if (!running) { running = true; requestAnimationFrame(tick); }
    }

    Array.prototype.forEach.call(links, function(a) {
      a.addEventListener('mouseenter', function() { hot = a; start(); });
      a.addEventListener('mouseleave', function() { if (hot === a) hot = null; });
    });

    function tick() {
      var w = nav.clientWidth, h = nav.clientHeight;
      ctx.clearRect(0, 0, w, h);
      if (hot) {
        var hr = hot.getBoundingClientRect(), nr = nav.getBoundingClientRect();
        var bx = hr.left - nr.left, by = hr.top - nr.top + hr.height;
        for (var k = 0; k < 3 && P.length < 420; k++) {
          P.push({
            x: bx + Math.random() * hr.width,
            y: by - 2,
            vx: (Math.random() - 0.5) * 0.9,
            vy: -(0.9 + Math.random() * 2.2),
            l: 1,
            d: 0.018 + Math.random() * 0.020,
            r: 0.6 + Math.random() * 1.6
          });
        }
      }
      ctx.globalCompositeOperation = 'lighter';
      for (var i = P.length - 1; i >= 0; i--) {
        var p = P[i];
        p.vy -= 0.012;
        p.x += p.vx;
        p.y += p.vy;
        p.l -= p.d;
        if (p.l <= 0) { P.splice(i, 1); continue; }
        var c = p.l > 0.7 ? '235,245,255' : (p.l > 0.4 ? '120,180,255' : '47,127,255');
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * p.l * 1.5, 0, 6.283);
        ctx.fillStyle = 'rgba(' + c + ',' + (p.l * p.l * 0.7).toFixed(3) + ')';
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      if (!hot && P.length === 0) { running = false; return; }
      requestAnimationFrame(tick);
    }
  }

})();