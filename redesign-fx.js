(function() {
  document.querySelectorAll('.faq-question').forEach(function(btn) {
    var item = btn.closest('.faq-item');
    var answer = item.querySelector('.faq-answer');
    function setHeight() {
      if (item.classList.contains('open')) {
        answer.style.maxHeight = answer.scrollHeight + 'px';
      } else {
        answer.style.maxHeight = '0px';
      }
    }
    setHeight();
    btn.addEventListener('click', function() {
      var wasOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(function(openItem) {
        openItem.classList.remove('open');
        openItem.querySelector('.faq-answer').style.maxHeight = '0px';
      });
      if (!wasOpen) {
        item.classList.add('open');
        setHeight();
      }
    });
  });
})();

(function() {
  var heading = document.getElementById('faq-heading');
  if (!heading) return;
  var text = heading.textContent;
  heading.innerHTML = '';
  text.split('').forEach(function(ch) {
    var span = document.createElement('span');
    span.textContent = ch === ' ' ? '\u00A0' : ch;
    heading.appendChild(span);
  });
  heading.addEventListener('mousemove', function(e) {
    var rect = heading.getBoundingClientRect();
    Array.from(heading.children).forEach(function(span) {
      var sr = span.getBoundingClientRect();
      var dx = (sr.left + sr.width / 2) - e.clientX;
      var dy = (sr.top + sr.height / 2) - e.clientY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var force = Math.max(0, 1 - dist / 70);
      span.style.transform = 'translate(' + (-dx * force * 0.35) + 'px,' + (-dy * force * 0.35) + 'px)';
    });
  });
  heading.addEventListener('mouseleave', function() {
    Array.from(heading.children).forEach(function(span) { span.style.transform = 'translate(0,0)'; });
  });
  var headingObs = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      heading.classList.toggle('revealed', entry.isIntersecting);
    });
  }, { threshold: 0.5 });
  headingObs.observe(heading);
})();

(function() {
  var heading = document.getElementById('hero-heading');
  var hero = document.getElementById('hero');
  if (!heading || !hero) return;
  hero.addEventListener('mousemove', function(e) {
    var rect = hero.getBoundingClientRect();
    var px = (e.clientX - rect.left) / rect.width - 0.5;
    var py = (e.clientY - rect.top) / rect.height - 0.5;
    heading.style.transform = 'perspective(600px) rotateY(' + (px * 24) + 'deg) rotateX(' + (py * -24) + 'deg)';
  });
  hero.addEventListener('mouseleave', function() {
    heading.style.transform = 'perspective(600px) rotateY(0deg) rotateX(0deg)';
  });
})();

(function() {
  var el = document.getElementById('hero-eyebrow');
  if (!el) return;
  var text = el.textContent;
  el.textContent = '';
  var i = 0;
  function type() {
    if (i <= text.length) {
      el.textContent = text.slice(0, i);
      i++;
      setTimeout(type, 40);
    }
  }
  type();
})();

(function() {
  var el = document.getElementById('hero-para');
  if (!el) return;
  var words = el.textContent.split(' ');
  el.innerHTML = '';
  words.forEach(function(w, i) {
    var span = document.createElement('span');
    span.textContent = w;
    el.appendChild(span);
    el.appendChild(document.createTextNode(' '));
    setTimeout(function() {
      span.style.filter = 'blur(0)';
      span.style.opacity = '1';
    }, 600 + i * 70);
  });
})();

(function() {
  var btn = document.getElementById('hero-cta');
  if (!btn) return;
  var brackets = Array.prototype.slice.call(btn.querySelectorAll('div'));
  var letters = [];
  var text = btn.textContent;
  btn.innerHTML = '';
  text.split('').forEach(function(ch) {
    var span = document.createElement('span');
    span.textContent = ch === ' ' ? '\u00A0' : ch;
    btn.appendChild(span);
    letters.push(span);
  });
  brackets.forEach(function(b) { btn.appendChild(b); });
  btn.addEventListener('mousemove', function(e) {
    letters.forEach(function(span) {
      var sr = span.getBoundingClientRect();
      var dx = (sr.left + sr.width / 2) - e.clientX;
      var dy = (sr.top + sr.height / 2) - e.clientY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var force = Math.max(0, 1 - dist / 50);
      span.style.transform = 'translate(' + (-dx * force * 0.3) + 'px,' + (-dy * force * 0.3) + 'px)';
    });
  });
  btn.addEventListener('mouseleave', function() {
    letters.forEach(function(span) { span.style.transform = 'translate(0,0)'; });
  });
})();

(function() {
  var heading = document.getElementById('work-heading');
  if (!heading) return;
  var text = heading.textContent;

  var measureCanvas = document.createElement('canvas');
  var mctx = measureCanvas.getContext('2d');
  mctx.font = "700 32px 'Space Grotesk', sans-serif";
  var textWidth = Math.ceil(mctx.measureText(text).width) + 20;
  var CW = textWidth, CH = 60;

  var canvas = document.createElement('canvas');
  canvas.id = 'work-canvas';
  canvas.width = CW;
  canvas.height = CH;
  canvas.style.maxWidth = CW + 'px';
  heading.parentNode.insertBefore(canvas, heading);
  var ctx = canvas.getContext('2d');

  var off = document.createElement('canvas');
  off.width = CW; off.height = CH;
  var octx = off.getContext('2d');
  octx.font = "700 32px 'Space Grotesk', sans-serif";
  octx.fillStyle = '#fff';
  octx.textBaseline = 'middle';
  octx.fillText(text, 4, CH / 2);
  var data = octx.getImageData(0, 0, CW, CH).data;
  var pts = [];
  for (var y = 0; y < CH; y += 2) {
    for (var x = 0; x < CW; x += 2) {
      if (data[(y * CW + x) * 4 + 3] > 128) {
        pts.push({ tx: x, ty: y, x: 0, y: 0 });
      }
    }
  }

  var start = null;
  var running = false;
  function draw(t) {
    if (start === null) start = t;
    var elapsed = t - start;
    var prog = Math.min(1, elapsed / 1400);
    ctx.clearRect(0, 0, CW, CH);
    ctx.fillStyle = '#fff';
    pts.forEach(function(p) {
      var cx = p.x + (p.tx - p.x) * prog;
      var cy = p.y + (p.ty - p.y) * prog;
      ctx.fillRect(cx, cy, 2, 2);
    });
    if (prog < 1) { requestAnimationFrame(draw); } else { running = false; }
  }
  function play() {
    if (running) return;
    running = true;
    pts.forEach(function(p) { p.x = Math.random() * CW; p.y = Math.random() * CH; });
    start = null;
    requestAnimationFrame(draw);
  }
  var obs = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        heading.classList.add('particle-active');
        play();
      }
    });
  }, { threshold: 0.4 });
  obs.observe(heading);
})();

(function() {
  document.querySelectorAll('.trace-heading').forEach(function(h3) {
    var text = h3.textContent;
    var svgWidth = text.length * 20 + 10;
    h3.innerHTML = '<svg viewBox="0 0 ' + svgWidth + ' 40" width="' + svgWidth + '" height="40">' +
      '<text x="2" y="28" font-family="Space Grotesk, sans-serif" font-weight="700" font-size="22" fill="none" stroke="#2f7fff" stroke-width="1" stroke-dasharray="300" stroke-dashoffset="300">' + text + '</text></svg>';
    var traceEl = h3.querySelector('text');
    h3.style.opacity = '1';
    var obs = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          traceEl.style.transition = 'none';
          traceEl.style.fill = 'none';
          traceEl.style.strokeDashoffset = '300';
          void traceEl.getBoundingClientRect();
          traceEl.style.transition = 'stroke-dashoffset 1s ease';
          traceEl.style.strokeDashoffset = '0';
          setTimeout(function() {
            traceEl.style.transition = 'fill 0.5s ease';
            traceEl.style.fill = '#fff';
          }, 900);
        }
      });
    }, { threshold: 0.3 });
    obs.observe(h3);
  });
})();

(function() {
  var heading = document.getElementById('gravity-heading');
  if (!heading) return;
  
  var text = heading.textContent;
  heading.innerHTML = '';
  var letters = [];
  
  // Create spans for each character
  text.split('').forEach(function(ch, idx) {
    var span = document.createElement('span');
    span.className = 'contact-letter';
    span.textContent = ch === ' ' ? '\u00A0' : ch;
    span.style.opacity = '0';
    heading.appendChild(span);
    letters.push({ el: span, idx: idx });
  });
  
  var typewriterDone = false;
  
  // Create cursor
  var cursor = document.createElement('div');
  cursor.className = 'typewriter-cursor';
  cursor.style.display = 'none';
  cursor.style.left = '0';
  cursor.style.top = '0';
  heading.appendChild(cursor);
  
  // Trigger typewriter on scroll
  var obs = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting && !typewriterDone) {
        typewriterDone = true;
        // Start typewriter animation
        letters.forEach(function(l, i) {
          setTimeout(function() {
            // Position cursor over the letter using offset calculations
            var letterLeft = 0;
            var letterTop = 0;
            var el = l.el;
            while (el && el !== heading) {
              letterLeft += el.offsetLeft;
              letterTop += el.offsetTop;
              el = el.offsetParent;
            }
            cursor.style.display = 'block';
            cursor.style.left = (letterLeft - 2) + 'px';
            cursor.style.top = (letterTop - 4) + 'px';
            
            // Trigger glow animation
            cursor.style.animation = 'none';
            void cursor.offsetWidth; // Force reflow
            cursor.style.animation = 'typewriterGlow 0.35s ease-out';
            
            // Show the letter
            l.el.style.opacity = '1';
          }, i * 100); // 100ms between each letter
        });
        // Hide cursor after typewriter finishes
        setTimeout(function() {
          cursor.style.display = 'none';
        }, letters.length * 100 + 300);
      }
    });
  }, { threshold: 0.3 });
  obs.observe(heading);
})();

(function() {
  // Shimmer sweep on every FAQ question, continuous
  document.querySelectorAll('.faq-question').forEach(function(btn) {
    var chevron = btn.querySelector('.chevron');
    var textOnly = btn.textContent.replace(chevron ? chevron.textContent : '', '').trim();
    var wrap = document.createElement('span');
    wrap.className = 'faq-q-shimmer';
    wrap.textContent = textOnly;
    btn.innerHTML = '';
    btn.appendChild(wrap);
    if (chevron) btn.appendChild(chevron);
  });

  // Magnetic hover on every FAQ answer's text
  document.querySelectorAll('.faq-answer p').forEach(function(p) {
    var words = p.textContent.split(' ');
    p.innerHTML = '';
    words.forEach(function(w, i) {
      var span = document.createElement('span');
      span.textContent = w;
      p.appendChild(span);
      if (i < words.length - 1) p.appendChild(document.createTextNode(' '));
    });
    p.addEventListener('mousemove', function(e) {
      Array.from(p.querySelectorAll('span')).forEach(function(span) {
        var sr = span.getBoundingClientRect();
        var dx = (sr.left + sr.width / 2) - e.clientX;
        var dy = (sr.top + sr.height / 2) - e.clientY;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var force = Math.max(0, 1 - dist / 60);
        span.style.transform = 'translate(' + (-dx * force * 0.25) + 'px,' + (-dy * force * 0.25) + 'px)';
      });
    });
    p.addEventListener('mouseleave', function() {
      Array.from(p.querySelectorAll('span')).forEach(function(span) { span.style.transform = 'translate(0,0)'; });
    });
  });
})();

(function() {
  var PROJECTS = [
    { slug: '3fs', title: '3FS', desc: 'Fast-paced card game PWA built from scratch', src: 'https://ignitewebdev.com/3fs/intro.mp4', type: 'video', url: 'https://ignitewebdev.com/3fs/' },
    { slug: 'signal-lost', title: 'Signal Lost', desc: 'HTML lessons through an interactive story', src: 'https://ignitewebdev.com/images/signal-demo.mp4', type: 'video', url: null },
    { slug: 'neon-province', title: 'Neon Province', desc: 'Learn CSS through story', src: 'https://ignitewebdev.com/images/neon-demo.mp4', type: 'video', url: null },
    { slug: 'bizcheck', title: 'BizCheck', desc: 'Job-costing software for trade and service businesses', src: 'https://ignitewebdev.com/images/bizcheck-display-1.jpg', type: 'img', url: 'https://ignitewebdev.com/bizcheck/' },
    { slug: 'saltline', title: 'Salt Line Kitchen', desc: 'Table-side QR ordering, no delivery-app commission taken', src: 'https://ignitewebdev.com/saltline/saltline-screenshot-1.jpg', type: 'img', url: 'https://ignitewebdev.com/saltline/demo/' },
    { slug: 'coldside', title: 'ColdSide Study', desc: 'EPA 608 exam prep', src: 'https://ignitewebdev.com/images/coldside-screenshot-1.png', type: 'img', url: 'https://coldsidestudy.netlify.app' }
  ];

  var track = document.getElementById('showcaseFadeTrack');
  var dotsWrap = document.getElementById('showcaseFadeDots');
  if (!track) return;
  var slides = [];
  var activeIndex = 0;

  PROJECTS.forEach(function(p, i) {
    var slide = document.createElement('div');
    slide.className = 'showcase-fade-slide' + (i === 0 ? ' is-active' : '');

    var media = p.type === 'video' ? document.createElement('video') : document.createElement('img');
    if (p.type === 'video') { media.muted = true; media.autoplay = true; media.loop = true; media.playsInline = true; }
    media.src = p.src;
    slide.appendChild(media);

    var overlay = document.createElement('div');
    overlay.className = 'showcase-fade-overlay';
    overlay.innerHTML = '<h3>' + p.title + '</h3><p>' + p.desc + '</p>' +
      (p.url ? '<a href="' + p.url + '" target="_blank" rel="noopener">Visit project &rarr;</a>' : '<span style="color:rgba(255,255,255,0.4);font-size:0.85rem;font-style:italic;">Link not currently available</span>');
    slide.appendChild(overlay);

    slide.addEventListener('click', function(e) {
      if (e.target.closest('a')) return;
      if (dragged) return;
      if (i === activeIndex && p.url) {
        window.open(p.url, '_blank', 'noopener');
      } else {
        goTo(i);
      }
    });

    track.appendChild(slide);
    slides.push(slide);

    var dot = document.createElement('button');
    if (i === 0) dot.classList.add('active');
    dot.addEventListener('click', function() { goTo(i); });
    dotsWrap.appendChild(dot);
  });

  function goTo(i) {
    var next = (i + PROJECTS.length) % PROJECTS.length;
    if (next === activeIndex) return;
    slides[activeIndex].classList.remove('is-active');
    slides[next].classList.add('is-active');
    Array.from(dotsWrap.children).forEach(function(d, idx) { d.classList.toggle('active', idx === next); });
    activeIndex = next;
  }

  document.getElementById('fadePrevBtn').addEventListener('click', function() { goTo(activeIndex - 1); });
  document.getElementById('fadeNextBtn').addEventListener('click', function() { goTo(activeIndex + 1); });

  var dragging = false, dragged = false, startX = 0;
  track.addEventListener('pointerdown', function(e) {
    dragging = true; dragged = false; startX = e.clientX;
    try { track.setPointerCapture(e.pointerId); } catch (err) {}
  });
  track.addEventListener('pointermove', function(e) {
    if (!dragging) return;
    if (Math.abs(e.clientX - startX) > 8) dragged = true;
  });
  window.addEventListener('pointerup', function(e) {
    if (!dragging) return;
    dragging = false;
    var delta = e.clientX - startX;
    if (Math.abs(delta) > 50) goTo(activeIndex + (delta < 0 ? 1 : -1));
  });

  var wheelLock = false;
  track.addEventListener('wheel', function(e) {
    if (Math.abs(e.deltaX) < 5) return;
    e.preventDefault();
    if (wheelLock) return;
    wheelLock = true;
    goTo(activeIndex + (e.deltaX > 0 ? 1 : -1));
    setTimeout(function() { wheelLock = false; }, 500);
  }, { passive: false });
})();