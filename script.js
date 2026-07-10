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

document.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    mouseX = touch.clientX;
    mouseY = touch.clientY;
    dot.style.left = mouseX + 'px';
    dot.style.top = mouseY + 'px';
});

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

const lightbox = document.getElementById('lightbox');
const lightboxContent = document.getElementById('lightboxContent');
const lightboxClose = document.getElementById('lightboxClose');
const lightboxPrev = document.getElementById('lightboxPrev');
const lightboxNext = document.getElementById('lightboxNext');

let lightboxSlides = [];
let lightboxIndex = 0;

function renderLightboxSlide() {
    lightboxContent.innerHTML = '';
    const slideData = lightboxSlides[lightboxIndex];

    if (slideData.type === 'video') {
        const video = document.createElement('video');
        video.src = slideData.src;
        video.controls = true;
        video.autoplay = true;
        video.muted = true;
        lightboxContent.appendChild(video);
    } else {
        const img = document.createElement('img');
        img.src = slideData.src;
        img.alt = slideData.alt;
        lightboxContent.appendChild(img);
    }
}

document.querySelectorAll('.media-cycle').forEach((cycle) => {
    cycle.addEventListener('click', () => {
        const slideEls = cycle.querySelectorAll('.slide');
        lightboxSlides = Array.from(slideEls).map((el) => ({
            type: el.tagName === 'VIDEO' ? 'video' : 'image',
            src: el.dataset.full || el.src,
            alt: el.alt || ''
        }));

        const activeEl = cycle.querySelector('.slide.active');
        lightboxIndex = Array.from(slideEls).indexOf(activeEl);

        renderLightboxSlide();
        lightbox.classList.add('open');
    });
});

function closeLightbox() {
    lightbox.classList.remove('open');
    lightboxContent.innerHTML = '';
}

function showPrev() {
    lightboxIndex = (lightboxIndex - 1 + lightboxSlides.length) % lightboxSlides.length;
    renderLightboxSlide();
}

function showNext() {
    lightboxIndex = (lightboxIndex + 1) % lightboxSlides.length;
    renderLightboxSlide();
}

lightboxClose.addEventListener('click', closeLightbox);
lightboxPrev.addEventListener('click', showPrev);
lightboxNext.addEventListener('click', showNext);

lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
});