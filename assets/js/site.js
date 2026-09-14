/* Heal Before Home — site behaviour
   Vanilla JS, no dependencies. */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------
     Sticky header state
     --------------------------------------------------------- */
  var header = document.querySelector('.site-header');
  if (header) {
    var onScroll = function () {
      header.classList.toggle('is-scrolled', window.scrollY > 12);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------------------------------------------------------
     Mobile navigation
     --------------------------------------------------------- */
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('primary-nav');
  if (toggle && nav) {
    var setNav = function (open) {
      toggle.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('is-open', open);
      document.body.style.overflow = open && window.innerWidth <= 1120 ? 'hidden' : '';
    };
    toggle.addEventListener('click', function () {
      setNav(toggle.getAttribute('aria-expanded') !== 'true');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setNav(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setNav(false);
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 1120) setNav(false);
    });
  }

  /* ---------------------------------------------------------
     Hero carousel
     Headline and CTAs stay fixed; only the imagery rotates.
     --------------------------------------------------------- */
  var carousel = document.querySelector('[data-carousel]');
  if (carousel) {
    var slides = Array.prototype.slice.call(carousel.querySelectorAll('.hero-slide'));
    var dotWrap = carousel.querySelector('.hero-dots');
    var prevBtn = carousel.querySelector('[data-carousel-prev]');
    var nextBtn = carousel.querySelector('[data-carousel-next]');
    var interval = parseInt(carousel.getAttribute('data-interval'), 10) || 5000;
    var index = 0;
    var timer = null;
    var dots = [];

    if (slides.length > 1 && dotWrap) {
      slides.forEach(function (slide, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
        b.setAttribute('aria-label', 'Show image ' + (i + 1) + ' of ' + slides.length +
          (slide.dataset.label ? ': ' + slide.dataset.label : ''));
        b.addEventListener('click', function () { go(i); });
        dotWrap.appendChild(b);
        dots.push(b);
      });
    }

    // The first advance comes 5s after load, which is not much time on a slow
    // connection — start fetching slide two immediately rather than waiting for
    // the browser's lazy-loading heuristic.
    if (slides.length > 1) {
      var second = slides[1].querySelector('img');
      if (second && second.loading === 'lazy') second.loading = 'eager';
    }

    // Release the primed first slide once it has painted, so its zoom runs too.
    // Two frames: one to paint the start value, one for the change to transition.
    var primed = carousel.querySelector('.hero-slide.is-priming');
    if (primed) {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () { primed.classList.remove('is-priming'); });
      });
    }

    /* --- scheduling ------------------------------------------------
       One chained timeout that is always cleared before it is set, so
       overlapping pause/resume events can never leave a second timer
       running. Pause reasons are tracked by name rather than as a single
       flag, so hover and keyboard focus cannot cancel each other out. */
    var pausedBy = { pointer: false, focus: false };

    function isPaused() {
      return pausedBy.pointer || pausedBy.focus || document.hidden;
    }

    function stop() {
      if (timer !== null) { window.clearTimeout(timer); timer = null; }
    }

    function schedule() {
      stop();
      if (reduceMotion || slides.length < 2 || isPaused()) return;
      timer = window.setTimeout(function () {
        timer = null;
        go(index + 1);
      }, interval);
    }

    function setPause(reason, value) {
      if (pausedBy[reason] === value) return;
      pausedBy[reason] = value;
      if (value) { stop(); } else { schedule(); }
    }

    function go(next) {
      next = (next + slides.length) % slides.length;
      if (next !== index) {
        slides[index].classList.remove('is-active');
        if (dots[index]) dots[index].setAttribute('aria-pressed', 'false');
        index = next;
        slides[index].classList.add('is-active');
        if (dots[index]) dots[index].setAttribute('aria-pressed', 'true');
        // Decode the following slide ahead of time so the fade is clean.
        var upcoming = slides[(index + 1) % slides.length].querySelector('img');
        if (upcoming && upcoming.loading === 'lazy') upcoming.loading = 'eager';
      }
      // Every slide gets a full interval, however it was reached.
      schedule();
    }

    if (prevBtn) prevBtn.addEventListener('click', function () { go(index - 1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { go(index + 1); });

    /* Hover pauses over the controls only. The hero fills the whole first
       screen, so pausing whenever the pointer sits anywhere over it would
       freeze the carousel for most visitors. */
    var controls = carousel.querySelector('.hero-controls');
    if (controls) {
      controls.addEventListener('mouseenter', function () { setPause('pointer', true); });
      controls.addEventListener('mouseleave', function () { setPause('pointer', false); });
    }

    /* Keyboard focus anywhere in the carousel pauses it; moving focus between
       the dots and the arrows should not resume and re-pause it. */
    carousel.addEventListener('focusin', function (e) {
      // Only keyboard focus pauses. A mouse click on a dot also focuses it, and
      // pausing there would freeze the carousel until the visitor clicked away.
      var keyboard = true;
      try { keyboard = e.target.matches(':focus-visible'); } catch (err) { /* older engine */ }
      if (keyboard) setPause('focus', true);
    });
    carousel.addEventListener('focusout', function (e) {
      if (!carousel.contains(e.relatedTarget)) setPause('focus', false);
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { stop(); } else { schedule(); }
    });

    carousel.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { go(index - 1); }
      if (e.key === 'ArrowRight') { go(index + 1); }
    });

    // Touch swipe
    var startX = null;
    carousel.addEventListener('touchstart', function (e) {
      startX = e.changedTouches[0].clientX;
      setPause('pointer', true);
    }, { passive: true });
    carousel.addEventListener('touchend', function (e) {
      if (startX !== null) {
        var dx = e.changedTouches[0].clientX - startX;
        startX = null;
        if (Math.abs(dx) > 45) go(index + (dx < 0 ? 1 : -1));
      }
      setPause('pointer', false);
    }, { passive: true });
    carousel.addEventListener('touchcancel', function () {
      startX = null;
      setPause('pointer', false);
    }, { passive: true });

    schedule();
  }

  /* ---------------------------------------------------------
     Accordions (FAQ, areas of care)
     --------------------------------------------------------- */
  Array.prototype.forEach.call(document.querySelectorAll('.acc-trigger'), function (btn) {
    btn.addEventListener('click', function () {
      var item = btn.closest('.acc-item');
      var group = btn.closest('[data-accordion-exclusive]');
      var open = btn.getAttribute('aria-expanded') === 'true';
      if (group && !open) {
        Array.prototype.forEach.call(group.querySelectorAll('.acc-item.is-open'), function (other) {
          other.classList.remove('is-open');
          var t = other.querySelector('.acc-trigger');
          if (t) t.setAttribute('aria-expanded', 'false');
        });
      }
      item.classList.toggle('is-open', !open);
      btn.setAttribute('aria-expanded', String(!open));
    });
  });

  /* ---------------------------------------------------------
     Scroll reveal
     --------------------------------------------------------- */
  var revealables = document.querySelectorAll('[data-reveal]');
  if (revealables.length) {
    if (reduceMotion || !('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(revealables, function (el) { el.classList.add('is-visible'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      Array.prototype.forEach.call(revealables, function (el) { io.observe(el); });
    }
  }

  /* ---------------------------------------------------------
     Stagger helper: [data-reveal-group] delays its children
     --------------------------------------------------------- */
  Array.prototype.forEach.call(document.querySelectorAll('[data-reveal-group]'), function (group) {
    Array.prototype.forEach.call(group.children, function (child, i) {
      if (child.hasAttribute('data-reveal')) {
        child.style.setProperty('--reveal-delay', Math.min(i, 5) * 80 + 'ms');
      }
    });
  });

  /* ---------------------------------------------------------
     Current year in footer
     --------------------------------------------------------- */
  Array.prototype.forEach.call(document.querySelectorAll('[data-year]'), function (el) {
    el.textContent = String(new Date().getFullYear());
  });
})();
