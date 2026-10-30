const menuButton = document.querySelector('#menu-toggle');
const menu = document.querySelector('#site-nav');
if (menuButton && menu) {
  const closeMenu = () => {
    menu.classList.remove('is-open');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Abrir menú');
  };
  menuButton.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') !== 'true';
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    menu.classList.toggle('is-open', open);
  });
  menu.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
  document.addEventListener('click', event => {
    if (!menu.contains(event.target) && !menuButton.contains(event.target)) closeMenu();
  });
}

const carouselTrack = document.querySelector('#carousel-track');
if (carouselTrack) {
  const slides = [...carouselTrack.querySelectorAll('.carousel-slide')];
  const dots = [...document.querySelectorAll('.carousel-dots button')];
  const counter = document.querySelector('#carousel-current');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let current = 0;
  let timer;
  const showSlide = index => {
    current = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      slide.classList.toggle('is-active', i === current);
      slide.setAttribute('aria-hidden', String(i !== current));
    });
    dots.forEach((dot, i) => dot.setAttribute('aria-current', String(i === current)));
    counter.textContent = String(current + 1).padStart(2, '0');
  };
  const start = () => {
    clearInterval(timer);
    if (!reducedMotion.matches) timer = setInterval(() => showSlide(current + 1), 2000);
  };
  document.querySelector('#carousel-prev').addEventListener('click', () => { showSlide(current - 1); start(); });
  document.querySelector('#carousel-next').addEventListener('click', () => { showSlide(current + 1); start(); });
  dots.forEach((dot, i) => dot.addEventListener('click', () => { showSlide(i); start(); }));
  const carousel = document.querySelector('.parts-carousel');
  carousel.addEventListener('mouseenter', () => clearInterval(timer));
  carousel.addEventListener('mouseleave', start);
  carousel.addEventListener('focusin', () => clearInterval(timer));
  carousel.addEventListener('focusout', start);
  reducedMotion.addEventListener?.('change', start);
  showSlide(0);
  start();
}

