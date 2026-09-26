/* Heal Before Home site behaviour
   Vanilla JS, no dependencies. */
(function () {
  'use strict';

  /* Reveal safety net: must come before anything that could throw.
     [data-reveal] content starts at opacity:0, but only because the inline head
     script sets html.js. That flag and this file fail independently, so if this
     file is blocked, 404s, or throws in any block below, every revealable element
     would stay invisible permanently, which is all the body content on most
     pages. Telling the inline script we got here cancels its own fallback, and
     the timer below covers a throw later in this file. */
  window.__hbhReady = true;

  function revealAll() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-reveal]'), function (el) {
      el.classList.add('is-visible');
    });
  }
  var revealBackstop = window.setTimeout(revealAll, 3000);

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
  var NAV_BREAKPOINT = 1180; // keep in step with the drawer @media in site.css
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('primary-nav');

  /* About dropdown: a disclosure button, not an ARIA menu, so the links inside
     stay ordinary links. Hover opens it on desktop through CSS alone; this is
     the click, keyboard and touch route, and it doubles as the accordion row
     inside the mobile drawer. */
  var groups = nav ? Array.prototype.slice.call(nav.querySelectorAll('.nav-group')) : [];
  var setGroup = function (group, open) {
    var btn = group.querySelector('.nav-group-toggle');
    if (btn) btn.setAttribute('aria-expanded', String(open));
  };
  var closeGroups = function (except) {
    groups.forEach(function (g) { if (g !== except) setGroup(g, false); });
  };
  groups.forEach(function (group) {
    var btn = group.querySelector('.nav-group-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') !== 'true';
      closeGroups(group);
      setGroup(group, open);
    });
    /* Escape shuts the submenu before the drawer, and puts focus back on the
       toggle, since the link it was on is about to be hidden. */
    group.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || btn.getAttribute('aria-expanded') !== 'true') return;
      e.stopPropagation();
      setGroup(group, false);
      btn.focus();
    });
    /* Tabbing out of the open panel on desktop would leave it floating over
       the page. In the drawer it is inline content, so leave it be. */
    group.addEventListener('focusout', function (e) {
      if (window.innerWidth <= NAV_BREAKPOINT) return;
      if (!group.contains(e.relatedTarget)) setGroup(group, false);
    });
  });
  if (groups.length) {
    document.addEventListener('click', function (e) {
      if (window.innerWidth <= NAV_BREAKPOINT) return;
      groups.forEach(function (g) { if (!g.contains(e.target)) setGroup(g, false); });
    });
  }

  if (toggle && nav) {
    var isOverlay = function () { return window.innerWidth <= NAV_BREAKPOINT; };

    /* Closing applies visibility:hidden to the panel. If focus is inside it at that
       moment - which is the normal case when closing with Escape - the browser has
       nowhere to put focus and drops it on <body>, so the next Tab restarts from the
       top of the document. Hand focus back to the toggle before that can happen. */
    var setNav = function (open) {
      var focusInside = nav.contains(document.activeElement);
      toggle.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('is-open', open);
      document.body.style.overflow = open && isOverlay() ? 'hidden' : '';
      if (!open && focusInside) toggle.focus();
      if (!open) closeGroups();
    };
    toggle.addEventListener('click', function () {
      setNav(toggle.getAttribute('aria-expanded') !== 'true');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setNav(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (toggle.getAttribute('aria-expanded') !== 'true') return;
      setNav(false);
    });

    /* While the panel covers the page, Tab must not walk into the content behind it:
       the body is scroll-locked, so focus would land somewhere the visitor cannot
       see or scroll to. Only while it is actually an overlay - above the breakpoint the nav
       is just a row in the header and should behave like ordinary content. */
    nav.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      if (!isOverlay() || toggle.getAttribute('aria-expanded') !== 'true') return;
      var items = nav.querySelectorAll('a[href], button:not([disabled])');
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        toggle.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        toggle.focus();
      }
    });

    /* Tabbing forward off the toggle should enter the open panel rather than skip it. */
    toggle.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab' || e.shiftKey) return;
      if (!isOverlay() || toggle.getAttribute('aria-expanded') !== 'true') return;
      var firstItem = nav.querySelector('a[href], button:not([disabled])');
      if (firstItem) { e.preventDefault(); firstItem.focus(); }
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > NAV_BREAKPOINT) setNav(false);
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

    /* Every slide but the first ships with its sources parked in data-
       attributes, so the browser cannot fetch them until we hand them over.
       loading="lazy" alone never deferred them: the slides are absolutely
       positioned at inset:0 inside the first viewport, so they all counted as
       visible and the entire carousel - about 750KB - arrived with the page.

       hydrate() is one-way and idempotent. Order matters: the <source> and
       srcset have to be in place before src, or the browser starts the fetch
       against the wrong candidate. */
    function hydrate(slide) {
      if (!slide || slide.getAttribute('data-hydrated')) return;
      slide.setAttribute('data-hydrated', '1');
      var source = slide.querySelector('source[data-srcset]');
      if (source) {
        source.setAttribute('srcset', source.getAttribute('data-srcset'));
        source.removeAttribute('data-srcset');
      }
      var img = slide.querySelector('img[data-src]');
      if (!img) return;
      if (img.getAttribute('data-srcset')) {
        img.setAttribute('srcset', img.getAttribute('data-srcset'));
        img.removeAttribute('data-srcset');
      }
      img.setAttribute('src', img.getAttribute('data-src'));
      img.removeAttribute('data-src');
    }

    /* The first advance is only 5s away, so slide two is staged up front - but at
       idle, so it never competes with the hero image for bandwidth during the LCP.
       Nothing beyond slide two is fetched until the carousel actually reaches it. */
    if (slides.length > 1) {
      var warmSecond = function () { hydrate(slides[1]); };
      if (window.requestIdleCallback) {
        window.requestIdleCallback(warmSecond, { timeout: 2500 });
      } else {
        window.setTimeout(warmSecond, 1200);
      }
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
       flag, so hover and keyboard focus cannot cancel each other out.
       `manual` is the visitor pressing pause. It outranks the others in the sense
       that hover and focus ending cannot clear it - schedule() re-checks every
       reason, so the carousel stays stopped until they press play again. */
    /* On a metered connection, auto-advance is the thing that quietly pulls down
       another ~700KB of decorative photography. Rather than disabling it - which
       would leave the pause/play button claiming to control something that is not
       happening - the carousel simply starts paused, and the visitor can start it. */
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    var saveData = !!(conn && conn.saveData);

    var pausedBy = { pointer: false, focus: false, manual: saveData };

    function isPaused() {
      return pausedBy.pointer || pausedBy.focus || pausedBy.manual || document.hidden;
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
        // The dots, arrows and swipe can all jump to a slide that was never
        // staged, so hydrate the destination before staging the one after it.
        hydrate(slides[index]);
        // Fetch the following slide ahead of time so the next fade is clean.
        hydrate(slides[(index + 1) % slides.length]);
      }
      // Every slide gets a full interval, however it was reached.
      schedule();
    }

    if (prevBtn) prevBtn.addEventListener('click', function () { go(index - 1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { go(index + 1); });

    /* Pause/stop control (WCAG 2.2.2). The arrows and dots only move between
       slides; this is the only thing that stops the motion itself. With reduced
       motion, or a single slide, nothing ever advances, so the button would be
       claiming to control something that is not happening, and is removed. */
    var toggleBtn = carousel.querySelector('[data-carousel-toggle]');
    if (toggleBtn) {
      if (reduceMotion || slides.length < 2) {
        toggleBtn.parentNode.removeChild(toggleBtn);
      } else {
        if (pausedBy.manual) {
          toggleBtn.classList.add('is-paused');
          toggleBtn.setAttribute('aria-label', 'Play image slideshow');
        }
        toggleBtn.addEventListener('click', function () {
          var paused = !pausedBy.manual;
          // Pressing play is an explicit request to move, so it also clears the
          // focus pause. Without this a keyboard user would press play and see
          // nothing happen until they tabbed out of the carousel.
          if (!paused) pausedBy.focus = false;
          setPause('manual', paused);
          toggleBtn.classList.toggle('is-paused', paused);
          toggleBtn.setAttribute('aria-label', paused ? 'Play image slideshow' : 'Pause image slideshow');
        });
      }
    }

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
     Deep links to an accordion. The area-of-care pages link at the Complex
     Journey Planning drawer on the home page, so a hash naming an .acc-item
     (or a block containing one) opens it rather than landing on a shut row.
     --------------------------------------------------------- */
  function openItem(item) {
    if (!item || item.classList.contains('is-open')) return;
    var trigger = item.querySelector('.acc-trigger');
    if (!trigger) return;
    item.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
  }

  function openAccordionAt(hash) {
    if (!hash || hash.length < 2) return;
    var target;
    try { target = document.getElementById(decodeURIComponent(hash.slice(1))); } catch (e) { return; }
    if (!target) return;
    var item = target.classList.contains('acc-item') ? target : target.querySelector('.acc-item');
    if (!item) return;
    /* Open the ancestors first. Since the home page put the journey steps behind
       their own drawer, the Complex Journey Planning item is nested one level
       down, and opening it alone would leave it inside a shut panel. */
    var chain = [], node = item;
    while (node) { chain.push(node); node = node.parentElement && node.parentElement.closest('.acc-item'); }
    chain.reverse();
    for (var i = 0; i < chain.length; i++) openItem(chain[i]);
    /* The outer panel animates its height, so the browser's own scroll ran
       against a collapsed box. Re-aim once the panel has settled. */
    if (chain.length > 1 && typeof target.scrollIntoView === 'function') {
      setTimeout(function () { target.scrollIntoView({ block: 'start' }); }, 420);
    }
  }
  openAccordionAt(window.location.hash);
  window.addEventListener('hashchange', function () { openAccordionAt(window.location.hash); });

  /* ---------------------------------------------------------
     Scroll reveal
     --------------------------------------------------------- */
  var revealables = document.querySelectorAll('[data-reveal]');
  if (revealables.length) {
    if (reduceMotion || !('IntersectionObserver' in window)) {
      revealAll();
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        });
        /* threshold is 0, not a fraction: intersectionRatio is capped by
           viewportHeight / elementHeight, so a container taller than the viewport
           by enough can never reach a fractional threshold. At 400% zoom that is
           an ordinary container, and it would stay hidden at every scroll
           position, for exactly the people who need the zoom. */
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0 });
      Array.prototype.forEach.call(revealables, function (el) { io.observe(el); });
    }
  }
  // The observer is wired up, so the blanket timer is no longer needed.
  window.clearTimeout(revealBackstop);

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
     Conditional form fields. A control carrying data-controls="<id>" and
     data-show-value="<value>" reveals that block only while it holds that
     value. Hiding also clears the block, so hubspot-forms.js never posts an
     answer to a question the guest can no longer see.
     --------------------------------------------------------- */
  Array.prototype.forEach.call(document.querySelectorAll('[data-controls]'), function (control) {
    var target = document.getElementById(control.getAttribute('data-controls'));
    if (!target) return;
    var want = control.getAttribute('data-show-value');

    function sync(clearOnHide) {
      var show = control.value === want;
      if (!show && clearOnHide) {
        Array.prototype.forEach.call(target.querySelectorAll('input, select, textarea'), function (f) {
          if (f.type === 'checkbox' || f.type === 'radio') f.checked = false;
          else f.value = '';
        });
      }
      target.hidden = !show;
    }

    control.addEventListener('change', function () { sync(true); });
    /* On load the browser may have restored a previous selection. */
    sync(false);
  });

  /* ---------------------------------------------------------
     Enquiry routes. The contact form serves three enquiries - a general
     journey, an Executive & Private Client proposal and an oncology second
     opinion - from one HubSpot form. The <select data-route-select> picks the
     route from each option's data-route; every element carrying
     data-routes="<route> <route>" shows only on the routes it names.

     A hidden block has its controls cleared and DISABLED, not just hidden:
     disabled controls are skipped by the browser's validity check and by
     collect() in hubspot-forms.js, so a required question on another route
     neither blocks the submit nor gets sent. Each control is disabled itself
     rather than through a fieldset, because collect() reads el.disabled and a
     control inside a disabled fieldset still reports false.

     ?enquiry=proposal|oncology picks the route on arrival, and
     ?experience=<slug> preselects the experience the visitor came from.
     --------------------------------------------------------- */
  var routeSelect = document.querySelector('[data-route-select]');
  if (routeSelect) {
    var routeForm = routeSelect.form;
    var routeBlocks = document.querySelectorAll('[data-routes]');
    var submitBtn = routeForm && routeForm.querySelector('[type="submit"]');
    var submitDefault = submitBtn ? submitBtn.textContent : '';

    var routeOf = function () {
      var opt = routeSelect.options[routeSelect.selectedIndex];
      return (opt && opt.getAttribute('data-route')) || 'general';
    };

    var applyRoute = function (clearOnHide) {
      var route = routeOf();
      Array.prototype.forEach.call(routeBlocks, function (block) {
        var show = (' ' + block.getAttribute('data-routes') + ' ').indexOf(' ' + route + ' ') !== -1;
        block.hidden = !show;
        var controls = block.matches('input, select, textarea') ? [block] : block.querySelectorAll('input, select, textarea');
        Array.prototype.forEach.call(controls, function (f) {
          if (!show && clearOnHide) {
            if (f.type === 'checkbox' || f.type === 'radio') f.checked = false;
            else f.value = '';
          }
          f.disabled = !show;
        });
        /* Clearing a controlling select does not fire its change event, so any
           data-controls block beneath it would stay open. Close them here. */
        if (!show && clearOnHide) {
          Array.prototype.forEach.call(block.querySelectorAll('[data-controls]'), function (c) {
            var t = document.getElementById(c.getAttribute('data-controls'));
            if (t) t.hidden = true;
          });
        }
      });
      if (submitBtn) submitBtn.textContent = submitBtn.getAttribute('data-text-' + route) || submitDefault;
      if (routeForm) {
        var success = routeForm.getAttribute('data-success-' + route);
        if (success) routeForm.setAttribute('data-success', success);
        else routeForm.removeAttribute('data-success');
      }
    };

    var params = new URLSearchParams(window.location.search);
    var wanted = params.get('enquiry');
    if (wanted) {
      Array.prototype.forEach.call(routeSelect.options, function (o) {
        if (o.getAttribute('data-route') === wanted) routeSelect.value = o.value;
      });
    }
    applyRoute(false);

    var slug = params.get('experience');
    if (slug && routeForm) {
      var match = routeForm.querySelector('option[data-slug="' + slug.replace(/[^a-z0-9-]/gi, '') + '"]');
      if (match && !match.parentNode.disabled) match.parentNode.value = match.value;
    }

    routeSelect.addEventListener('change', function () { applyRoute(true); });
  }

  /* ---------------------------------------------------------
     Current year in footer
     --------------------------------------------------------- */
  Array.prototype.forEach.call(document.querySelectorAll('[data-year]'), function (el) {
    el.textContent = String(new Date().getFullYear());
  });
})();
