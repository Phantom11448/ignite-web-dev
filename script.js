const dot = document.querySelector(".cursor-dot");
const ring = document.querySelector(".cursor-ring");
let mouseX = 0;
let mouseY = 0;
let ringX = 0;
let ringY = 0;

document.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  dot.style.left = mouseX + "px";
  dot.style.top = mouseY + "px";
});

function animateRing() {
    ringX += (mouseX - ringX) * 0.15;
    ringY += (mouseY - ringY) * 0.15;
    ring.style.left = ringX + "px";
    ring.style.top = ringY + "px";
    requestAnimationFrame(animateRing);
}
animateRing();

const clickableElements = document.querySelectorAll('a, button');
clickableElements.forEach(el => {
  el.addEventListener('mouseenter', () => {
    ring.classList.add('hovering');
  });
  el.addEventListener('mouseleave', () => {
    ring.classList.remove('hovering');
  });
});

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });

document.querySelectorAll('.reveal').forEach(el => {
  revealObserver.observe(el);
});
document.querySelectorAll('.media-cycle').forEach((cycle) => {
    const slides = cycle.querySelectorAll('.slide');
    let current = 0;

    function showNext() {
        slides[current].classList.remove('active');
        if (slides[current].tagName === 'VIDEO') {
            slides[current].pause();
            slides[current].currentTime = 0;
        }
        current = (current + 1) % slides.length;
        slides[current].classList.add('active');
        if (slides[current].tagName === 'VIDEO') {
            slides[current].currentTime = 0;
            slides[current].play();
            slides[current].onended = showNext;
        } else {
            setTimeout(showNext, 3000);
        }
    }

    if (slides[0].tagName === 'VIDEO') {
        slides[0].play();
        slides[0].onended = showNext;
    } else {
        setTimeout(showNext, 3000);
    }
});