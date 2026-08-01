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

// Full showcase page (/projects.html) has #all-projects; the homepage
// preview grid does not. Exhibit videos play with sound on the full
// showcase, but stay muted in the homepage preview.
const isFullShowcasePage = !!document.getElementById('all-projects');

function renderLightboxSlide() {
    lightboxContent.innerHTML = '';
    const slideData = lightboxSlides[lightboxIndex];

    if (slideData.type === 'video') {
        const video = document.createElement('video');
        video.src = slideData.src;
        video.controls = true;
        video.autoplay = true;
        video.muted = !isFullShowcasePage;
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
        const linkedAncestor = cycle.closest('[data-project-url]');
        if (linkedAncestor) {
            window.open(linkedAncestor.dataset.projectUrl, '_blank', 'noopener');
            return;
        }

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

if (lightboxClose && lightboxPrev && lightboxNext && lightbox) {
    lightboxClose.addEventListener('click', closeLightbox);
    lightboxPrev.addEventListener('click', showPrev);
    lightboxNext.addEventListener('click', showNext);

    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) closeLightbox();
    });
}

const marqueeTrack = document.querySelector('.project-marquee-track');
if (marqueeTrack) {
    let offset = 0;
    let dragging = false;
    let dragged = false;
    let startX = 0;
    let startOffset = 0;
    const speed = 0.4;

    function frame() {
        if (!dragging) {
            offset -= speed;
            const loopWidth = marqueeTrack.scrollWidth / 2;
            if (Math.abs(offset) >= loopWidth) offset += loopWidth;
        }
        marqueeTrack.style.transform = `translateX(${offset}px)`;
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    marqueeTrack.addEventListener('pointerdown', (e) => {
        dragging = true;
        dragged = false;
        startX = e.clientX;
        startOffset = offset;
    });
    marqueeTrack.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const delta = e.clientX - startX;
        if (Math.abs(delta) > 5) dragged = true;
        offset = startOffset + delta;
    });
    window.addEventListener('pointerup', () => {
        dragging = false;
    });
    marqueeTrack.addEventListener('click', (e) => {
        if (dragged) {
            e.stopPropagation();
            e.preventDefault();
        }
    }, true);
}

// Hero shader background — smoky, reactive gradient using the site's own ember/black palette
(function() {
    const canvas = document.getElementById('hero-shader');
    if (!canvas) return;
    const gl = canvas.getContext('webgl');
    if (!gl) return;

    function resize() {
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width * Math.min(window.devicePixelRatio || 1, 2);
        canvas.height = rect.height * Math.min(window.devicePixelRatio || 1, 2);
        gl.viewport(0, 0, canvas.width, canvas.height);
    }
    window.addEventListener('resize', resize);
    resize();

    const vertSrc = `
        attribute vec2 position;
        void main() { gl_Position = vec4(position, 0.0, 1.0); }
    `;

    const fragSrc = `
        precision highp float;
        uniform vec2 u_resolution;
        uniform float u_time;
        uniform vec2 u_mouse;

        vec3 hash3(vec2 p) {
            vec3 q = vec3(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)), dot(p, vec2(419.2, 371.9)));
            return fract(sin(q) * 43758.5453);
        }
        float noise(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash3(i).x, hash3(i + vec2(1,0)).x, u.x),
                       mix(hash3(i + vec2(0,1)).x, hash3(i + vec2(1,1)).x, u.x), u.y);
        }
        float fbm(vec2 p) {
            float v = 0.0; float a = 0.5;
            for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
            return v;
        }

        void main() {
            vec2 uv = gl_FragCoord.xy / u_resolution.xy;
            vec2 p = uv * 3.0;
            p.x *= u_resolution.x / u_resolution.y;

            vec2 mouseInfluence = (u_mouse - 0.5) * 1.2;
            float t = u_time * 0.05;

            float n1 = fbm(p + vec2(t, -t * 0.6) + mouseInfluence * 0.3);
            float n2 = fbm(p * 1.4 - vec2(t * 0.7, t * 0.3));
            float pattern = fbm(p + vec2(n1, n2) * 1.1);

            vec3 colorA = vec3(0.047, 0.047, 0.055);
            vec3 colorB = vec3(0.16, 0.07, 0.03);
            vec3 colorC = vec3(1.0, 0.42, 0.21);

            vec3 col = mix(colorA, colorB, smoothstep(0.2, 0.7, pattern));
            col = mix(col, colorC, smoothstep(0.72, 0.95, n2) * 0.35);

            float vignette = smoothstep(1.3, 0.2, length(uv - 0.5));
            col *= vignette * 0.85 + 0.15;

            gl_FragColor = vec4(col, 1.0);
        }
    `;

    function compile(type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return s;
    }

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vertSrc));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(prog, 'position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'u_resolution');
    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uMouse = gl.getUniformLocation(prog, 'u_mouse');

    let mouse = { x: 0.5, y: 0.5 };
    canvas.parentElement.addEventListener('pointermove', (e) => {
        const rect = canvas.parentElement.getBoundingClientRect();
        mouse.x = (e.clientX - rect.left) / rect.width;
        mouse.y = 1.0 - (e.clientY - rect.top) / rect.height;
    });

    function render(t) {
        gl.uniform2f(uRes, canvas.width, canvas.height);
        gl.uniform1f(uTime, t * 0.001);
        gl.uniform2f(uMouse, mouse.x, mouse.y);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
})();

// Text scramble on the hero heading only, on page load
(function() {
    const el = document.getElementById('hero-heading');
    if (!el) return;
    const finalHTML = el.innerHTML;
    const finalText = el.textContent;
    const chars = '!<>-_\\/[]{}—=+*^?#0123456789';
    let frame = 0;
    const totalFrames = 40;

    function scrambleFrame() {
        let output = '';
        const revealCount = Math.floor((frame / totalFrames) * finalText.length);
        for (let i = 0; i < finalText.length; i++) {
            const ch = finalText[i];
            if (ch === '\n' || ch === ' ') { output += ch; continue; }
            output += i < revealCount ? ch : chars[Math.floor(Math.random() * chars.length)];
        }
        el.textContent = output;
        frame++;
        if (frame <= totalFrames) {
            requestAnimationFrame(scrambleFrame);
        } else {
            el.innerHTML = finalHTML;
        }
    }
    requestAnimationFrame(scrambleFrame);
})();