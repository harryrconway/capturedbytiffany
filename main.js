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
		// Cap on how long the page will wait for the hero photographs before
		// fading in regardless. A broken or very slow image must never leave
		// the visitor looking at a blank screen.
		fadeFailsafe: 2000,

		// Wordmark crossfade, as a fraction of hero height scrolled.
		// The corner mark starts well before the hero mark is gone — without
		// that overlap there's a dead patch mid-scroll where neither is
		// really on screen, which reads as a flicker rather than a handoff.
		heroFadeEnd:    0.55,    // plate TYPE fully gone by here
		heroMediaEnd:   0.85,    // TILES and plate linger, gone by here
		brandFadeStart: 0.35,    // corner mark starts appearing here (and the bars turn to ink)
		brandFadeEnd:   0.75     // …and is fully opaque by here
	};

	var body = document.body;

	var el = {
		brand:    document.querySelector('.brand'),
		toggle:   document.querySelector('.nav-toggle'),
		overlay:  document.querySelector('.nav-overlay'),
		links:    document.querySelectorAll('.nav-overlay a'),
		hero:     document.querySelector('.hero'),
		heroImgs: document.querySelectorAll('.hero img')
	};

	function clamp(n) {
		return n < 0 ? 0 : (n > 1 ? 1 : n);
	}

	var prefersReducedMotion = window.matchMedia
		? window.matchMedia('(prefers-reduced-motion: reduce)').matches
		: false;


	/* ======================================================================
	   02  INTRO
	   One beat. The page holds on the ground colour until every hero
	   photograph has actually decoded, then everything fades in together —
	   all four, so the mosaic arrives as one piece and no tile is seen
	   landing late. (The projects page has no hero, so it never waits.)

	   Gating on decode (not `load`) is the point: `load` fires before the
	   pixels are ready, so a load-gated fade can still stutter on a large
	   image — which is exactly the flash this replaces.
	   ====================================================================== */

	function intro() {
		var started = false;
		var waiting = el.heroImgs.length;

		function start() {
			if (started) return;
			started = true;
			body.classList.add('is-ready');
		}

		// Each photograph reports exactly once, however it ends; the last one
		// in starts the fade
		function settled() {
			waiting -= 1;
			if (waiting === 0) start();
		}

		Array.prototype.forEach.call(el.heroImgs, function (img) {
			if (img.decode) {
				// Both arguments rather than .then().catch(): decode() rejects
				// on a broken image, and a rejection must still count — once
				img.decode().then(settled, settled);
			} else if (!img.complete) {
				img.addEventListener('load', settled);
				img.addEventListener('error', settled);
			} else {
				settled();
			}
		});

		if (!waiting) start();   // no hero photographs to wait for

		window.setTimeout(start, CONFIG.fadeFailsafe);
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
	   Crossfades the wordmark between the hero's type plate and the
	   top-right corner as the hero scrolls past. Writes three custom
	   properties; CSS does the rest, so this touches nothing but opacity.

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

			// Both fade from the very start; the type just clears first, so the
			// tiles are still receding as the work below comes up. A single
			// shared curve would empty the top half of the screen too early.
			// .hero__plate-in inherits --hero-op from .hero.
			write(el.hero, '--hero-op', heroOp);
			write(el.hero, '--hero-media-op', mediaOp);
			write(el.brand, '--brand-op', brandOp);

			// Class toggle only on threshold crossings, not every frame. It
			// flips the corner mark's pointer-events and turns the hamburger
			// to ink as the corner mark starts to wake — while the bars are
			// still over the hero's corner tile, which leaves from under them
			// at about 0.43 on a 16:10 screen. Any later and cream bars would
			// cross the white gap and the pale type plate.
			var isPast = p > CONFIG.brandFadeStart;
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
