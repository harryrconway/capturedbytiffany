/* ==========================================================================
   CAPTUREDBYTIFFANY — main.js

   01  CONFIG
   02  INTRO
   03  NAV
   04  HANDOFF
   05  REVEAL
   06  INIT
   ========================================================================== */

(function () {
	'use strict';

	/* ======================================================================
	   01  CONFIG
	   ====================================================================== */

	var CONFIG = {
		// Cap on how long the homepage will wait for the hero photograph once
		// the name is in — after the hold, or after a skip. A broken or very
		// slow image must never leave the visitor looking at a blank screen.
		// (The projects page has no hero, so never waits.)
		fadeFailsafe: 2000,

		// Loader. Letter timings live in CSS (--loader-*); JS only decides
		// when the letters start and when they leave. The letters wait up to
		// fontTimeout for Tenor Sans, then play regardless.
		fontTimeout:   2000,
		loaderHold:    400,    // the whole name, held still, before it leaves
		introFailsafe: 9500,   // absolute cap from init; CSS --intro-failsafe (11s) sits behind this

		// Wordmark crossfade, as a fraction of hero height scrolled.
		// The corner mark starts well before the hero mark is gone — without
		// that overlap there's a dead patch mid-scroll where neither is
		// really on screen, which reads as a flicker rather than a handoff.
		heroFadeEnd:    0.55,    // hero TEXT fully gone by here
		heroMediaEnd:   0.85,    // hero IMAGE lingers, gone by here
		brandFadeStart: 0.35,    // corner mark starts appearing here
		brandFadeEnd:   0.75     // …and is fully opaque by here
	};

	var body = document.body;

	var el = {
		loader:  document.querySelector('.loader'),
		brand:   document.querySelector('.brand'),
		toggle:  document.querySelector('.nav-toggle'),
		overlay: document.querySelector('.nav-overlay'),
		links:   document.querySelectorAll('.nav-overlay a'),
		hero:    document.querySelector('.hero'),
		heroImg: document.querySelector('.hero__media img')
	};

	function clamp(n) {
		return n < 0 ? 0 : (n > 1 ? 1 : n);
	}

	// A CSS time ("0.9s", "200ms") in milliseconds
	function ms(time) {
		time = String(time).trim();
		var n = parseFloat(time) || 0;
		return /ms$/.test(time) ? n : n * 1000;
	}

	var prefersReducedMotion = window.matchMedia
		? window.matchMedia('(prefers-reduced-motion: reduce)').matches
		: false;


	/* ======================================================================
	   02  INTRO
	   On the homepage: the name fades in letter by letter, holds, then fades
	   out in reverse — the y first, the C last — and the page comes up as
	   the C goes. On both pages the reveal also waits for the hero
	   photograph to decode (the projects page has none, so it is immediate).

	   Gating on decode (not `load`) is the point: `load` fires before the
	   pixels are ready, so a load-gated fade can still stutter on a large
	   image — which is exactly the flash this replaces.

	   The letters wait up to fontTimeout for Tenor Sans, then play whatever
	   happened. What fonts.load() resolves with is deliberately ignored:
	   Safari resolves an empty list when the face is already loaded (as on
	   any reload), so treating "no faces" as "no font" skipped the letters
	   on every iPhone.
	   ====================================================================== */

	function intro() {
		var loader  = el.loader;
		var letters = loader ? loader.querySelectorAll('.loader__word span') : [];
		var timing  = null;     // read from CSS as the letters start
		var started = false;    // .is-ready added
		var heroReady = false;
		var played  = false;    // letters set going (or given up on)
		var shown   = false;    // the whole name is in and has held
		var leaving = false;    // letters on their way out
		var skipped = false;

		// A click, a key or a scroll means the visitor wants the page, so it
		// cuts straight to the crossfade. Scroll is deliberately not locked: a
		// lock shifts the layout by the scrollbar and fights scroll restoration.
		var skipEvents = ['pointerdown', 'keydown', 'wheel'];

		function listen(on) {
			var method = on ? 'addEventListener' : 'removeEventListener';
			skipEvents.forEach(function (type) {
				window[method](type, skip, { passive: true });
			});
		}

		function removeLoader() {
			if (loader && loader.parentNode) loader.parentNode.removeChild(loader);
		}

		function start() {
			if (started) return;
			started = true;
			body.classList.add('is-ready');   // loader out, page in — one transition
			if (!loader) return;
			listen(false);
			// Backstop for the transitionend below: an event that never fires
			// must not leave the loader in the DOM
			window.setTimeout(removeLoader, CONFIG.fadeFailsafe);
		}

		// The letters leave in reverse, on the same stagger and fade they
		// arrived with. .is-ready lands as the C begins to go, so the name's
		// first letter fades out together with the loader itself.
		function leave() {
			if (leaving || started) return;
			leaving = true;

			if (skipped || !timing) {
				start();   // skipped, or the letters never ran: plain crossfade
				return;
			}

			var last = letters.length - 1;

			Array.prototype.forEach.call(letters, function (letter, i) {
				letter.animate([{ opacity: 1 }, { opacity: 0 }], {
					duration: timing.fade,
					delay:    (last - i) * timing.stagger,
					easing:   timing.easing,
					fill:     'forwards'
				});
			});

			window.setTimeout(start, last * timing.stagger);
		}

		function heroDone() {
			heroReady = true;
			if (shown) leave();
		}

		function nameShown() {
			if (shown) return;
			shown = true;
			if (heroReady) leave();
			else window.setTimeout(leave, CONFIG.fadeFailsafe);
		}

		function skip() {
			if (started) return;
			skipped = true;
			played = true;             // a font arriving now won't start the letters
			if (leaving || heroReady) start();
			else nameShown();          // still waits (briefly) for the hero
		}

		function play() {
			if (played) return;
			played = true;

			// No Web Animations API: the letters stay hidden and the page
			// simply comes up
			if (!letters.length || !letters[0].animate) {
				nameShown();
				return;
			}

			// Web Animations, not CSS transitions — the font swap would cancel
			// those mid-sequence (see style.css 12 LOADER). Timings are read
			// from the --loader-* tokens, so they live in one place, and the
			// reduced-motion override of --loader-stagger applies here too.
			var css = window.getComputedStyle(loader);

			timing = {
				lead:    ms(css.getPropertyValue('--loader-lead')),
				stagger: ms(css.getPropertyValue('--loader-stagger')),
				fade:    ms(css.getPropertyValue('--loader-fade')),
				easing:  css.getPropertyValue('--ease-soft').trim() || 'ease-in-out'
			};

			Array.prototype.forEach.call(letters, function (letter, i) {
				letter.animate([{ opacity: 0 }, { opacity: 1 }], {
					duration: timing.fade,
					delay:    timing.lead + i * timing.stagger,
					easing:   timing.easing,
					fill:     'forwards'
				});
			});

			// A timer rather than the last animation's finish event: the sums
			// are already in hand, and a timer can't be lost
			window.setTimeout(
				nameShown,
				timing.lead + (letters.length - 1) * timing.stagger + timing.fade + CONFIG.loaderHold
			);
		}

		// Gate 1 — the hero photograph
		var img = el.heroImg;

		if (img && img.decode) {
			// .catch matters: decode() rejects on a broken image, and without
			// it the page would sit black until the failsafe
			img.decode().then(heroDone).catch(heroDone);
		} else if (img && !img.complete) {
			img.addEventListener('load', heroDone);
			img.addEventListener('error', heroDone);
		} else {
			heroDone();
		}

		// Gate 2 — the letters, once style.css applies. Safari can run this
		// deferred script before the stylesheet has loaded: the --loader-*
		// tokens then read as empty (every timing collapses to 0) and
		// fonts.load() finds no @font-face to load.
		function whenStyled(fn) {
			var link = document.querySelector('link[rel="stylesheet"]');

			if (!link || window.getComputedStyle(loader).getPropertyValue('--loader-fade').trim()) {
				fn();
				return;
			}

			link.addEventListener('load', fn);
			link.addEventListener('error', fn);
		}

		function waitForFont() {
			if (!(document.fonts && document.fonts.load)) {
				play();
				return;
			}

			var fontTimer = window.setTimeout(play, CONFIG.fontTimeout);

			// Resolved or rejected, the letters play. A throw inside play()
			// lands in the final catch, and the page proceeds.
			document.fonts.load('1em "Tenor Sans"', 'Capturedbytiffany')
				.catch(function () {})
				.then(function () {
					window.clearTimeout(fontTimer);
					play();
				})
				.catch(nameShown);
		}

		if (loader) {
			listen(true);
			whenStyled(waitForFont);
		} else {
			nameShown();   // projects page
		}

		// Out of the DOM once faded. visibility:hidden already stops it taking
		// clicks; this stops it existing.
		if (loader) {
			loader.addEventListener('transitionend', function (e) {
				if (e.target === loader && e.propertyName === 'opacity') removeLoader();
			});
		}

		window.setTimeout(start, CONFIG.introFailsafe);
	}


	/* ======================================================================
	   03  NAV
	   ====================================================================== */

	function nav() {
		if (!el.toggle || !el.overlay) return;

		var isOpen = false;

		function lockScroll(lock) {
			if (lock) {
				// Compensate for the scrollbar so locking doesn't shift the page
				var gap = window.innerWidth - document.documentElement.clientWidth;
				body.style.overflow = 'hidden';
				if (gap > 0) body.style.paddingRight = gap + 'px';
			} else {
				body.style.overflow = '';
				body.style.paddingRight = '';
			}
		}

		function setOpen(open) {
			isOpen = open;
			body.classList.toggle('nav-open', open);
			el.toggle.setAttribute('aria-expanded', String(open));
			el.toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
			el.overlay.setAttribute('aria-hidden', String(!open));
			lockScroll(open);
		}

		function close() {
			if (!isOpen) return;
			setOpen(false);
			el.toggle.focus();
		}

		el.toggle.addEventListener('click', function () {
			setOpen(!isOpen);
		});

		// Click off — only when the backdrop itself is hit, so link clicks
		// aren't swallowed on their way through
		el.overlay.addEventListener('click', function (e) {
			if (e.target === el.overlay || e.target.classList.contains('nav-overlay__inner')) {
				close();
			}
		});

		// Any nav link closes it too
		Array.prototype.forEach.call(el.links, function (link) {
			link.addEventListener('click', function () { setOpen(false); });
		});

		document.addEventListener('keydown', function (e) {
			if (e.key === 'Escape' || e.key === 'Esc') close();
		});
	}


	/* ======================================================================
	   04  HANDOFF
	   Crossfades the wordmark between the hero centre and the top-right
	   corner as the hero scrolls past. Writes three custom properties; CSS
	   does the rest, so this touches nothing but opacity.

	   Each property is written on the element that reads it — .hero and
	   .brand — never on <body>. Custom properties inherit, so a write on
	   body restyles the whole page every frame. Unchanged values are skipped
	   too: once the hero is scrolled past, scrolling writes nothing at all.
	   ====================================================================== */

	function handoff() {
		// No hero to hand off from (the projects page). .brand is
		// opacity: var(--brand-op, 0), so returning without setting it would
		// leave the wordmark permanently invisible.
		if (!el.hero) {
			if (el.brand) el.brand.style.setProperty('--brand-op', 1);
			body.classList.add('past-hero');   // restores pointer-events
			return;
		}

		var heroHeight = el.hero.offsetHeight;
		var ticking = false;
		var wasPast = null;
		var written = {};

		function write(node, name, value) {
			if (!node || written[name] === value) return;
			written[name] = value;
			node.style.setProperty(name, value);
		}

		function apply() {
			ticking = false;

			// Fall back to 0, not 1. If the hero hasn't laid out yet, 1 would
			// mean "fully scrolled past" and drive --hero-media-op to 0,
			// blanking the hero until the next scroll snapped it back — the
			// flash this rewrite exists to remove. At an unknown scroll
			// position the safe assumption is the top of the page.
			var p = heroHeight > 0 ? clamp(window.pageYOffset / heroHeight) : 0;

			var heroOp  = 1 - clamp(p / CONFIG.heroFadeEnd);
			var mediaOp = 1 - clamp(p / CONFIG.heroMediaEnd);
			var brandOp = clamp(
				(p - CONFIG.brandFadeStart) /
				(CONFIG.brandFadeEnd - CONFIG.brandFadeStart)
			);

			// Both fade from the very start; the text just clears first, so the
			// picture is still receding as the work below comes up. A single
			// shared curve would empty the top half of the screen too early.
			// .hero__title-in inherits --hero-op from .hero.
			write(el.hero, '--hero-op', heroOp);
			write(el.hero, '--hero-media-op', mediaOp);
			write(el.brand, '--brand-op', brandOp);

			// Class toggle only on threshold crossings, not every frame —
			// it exists purely to flip pointer-events on the corner mark
			var isPast = p > 0.5;
			if (isPast !== wasPast) {
				wasPast = isPast;
				body.classList.toggle('past-hero', isPast);
			}
		}

		function onScroll() {
			if (ticking) return;
			ticking = true;
			window.requestAnimationFrame(apply);
		}

		function onResize() {
			heroHeight = el.hero.offsetHeight;
			apply();
		}

		window.addEventListener('scroll', onScroll, { passive: true });

		// ResizeObserver reports after layout, so reading offsetHeight there
		// never forces one, and it catches every cause of a height change, not
		// just window resizes. It also fires once on observe, which covers a
		// restored scroll position.
		if ('ResizeObserver' in window) {
			new ResizeObserver(onResize).observe(el.hero);
		} else {
			window.addEventListener('resize', onResize);
			window.addEventListener('orientationchange', onResize);
		}

		apply();
	}



	/* ======================================================================
	   05  REVEAL
	   Fades plates up as they enter the viewport. Queries .plate, which only
	   exists on the projects page — so this no-ops on the homepage, whose
	   scroll reveal was deliberately removed and must stay gone.
	   ====================================================================== */

	function reveal() {
		var plates = document.querySelectorAll('.plate');
		if (!plates.length) return;

		function showAll() {
			Array.prototype.forEach.call(plates, function (n) {
				n.classList.add('is-visible');
			});
		}

		if (!('IntersectionObserver' in window) || prefersReducedMotion) {
			showAll();
			return;
		}

		var observer = new IntersectionObserver(function (entries) {
			entries.forEach(function (entry) {
				if (!entry.isIntersecting) return;
				entry.target.classList.add('is-visible');
				observer.unobserve(entry.target);   // reveal once
			});
		}, {
			threshold: 0.15,
			rootMargin: '0px 0px -8% 0px'
		});

		Array.prototype.forEach.call(plates, function (n) { observer.observe(n); });
	}


	/* ======================================================================
	   06  INIT
	   ====================================================================== */

	function init() {
		intro();
		nav();
		handoff();
		reveal();
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}

})();
