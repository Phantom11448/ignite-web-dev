(function() {
  var el = document.getElementById('heroKicker');
  if (!el) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var real = el.textContent;
  var GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#%&$@*/';
  function scramble() {
    var f = 0, timer = null;
    clearInterval(timer);
    timer = setInterval(function() {
      var out = '';
      for (var i = 0; i < real.length; i++) {
        out += (i < f / 2) ? real[i] : (real[i] === ' ' ? ' ' : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]);
      }
      el.textContent = out;
      f++;
      if (f / 2 >= real.length) {
        el.textContent = real;
        clearInterval(timer);
      }
    }, 28);
  }
  scramble();
  setInterval(scramble, 7000);
})();