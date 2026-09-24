/* ==========================================================================
   CAPTUREDBYTIFFANY — main.js

   01  CONFIG
   02  INTRO
   03  NAV
   04  HANDOFF
   05  REVEAL
   06  ENQUIRY
   07  INIT
   ========================================================================== */

(function () {
	'use strict';

	/* ======================================================================
	   01  CONFIG
	   ====================================================================== */

	var CONFIG = {
		// Cap on how long the page will wait for the hero photograph before
		// fading in regardless. A broken or very slow image must never leave
		// the visitor looking at a blank screen.
		fadeFailsafe: 2000,

		// Wordmark crossfade, as a fraction of hero height scrolled.
		// The corner mark starts well before the hero mark is gone — without
		// that overlap there's a dead patch mid-scroll where neither is
		// really on screen, which reads as a flicker rather than a handoff.
		heroFadeEnd:    0.55,    // hero TYPE fully gone by here
		heroMediaEnd:   0.85,    // the PHOTOGRAPH lingers, gone by here
		brandFadeStart: 0.35,    // corner mark starts appearing here
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
	   One beat. The page holds on the ground colour until the hero photograph
	   has actually decoded, then everything fades in together. One photograph
	   now, not four: the querySelectorAll and the counter stay, so a second
	   hero image would still be waited for. (The projects page has no hero,
	   so it never waits.)

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
	   Crossfades the wordmark between the hero's masthead and the top-right
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

			// Both fade from the very start; the type just clears first, so the
			// photograph is still receding as the work below comes up. A single
			// shared curve would empty the top half of the screen too early.
			// .hero__type carries --hero-op; .hero carries the photograph's.
			write(el.hero, '--hero-op', heroOp);
			write(el.hero, '--hero-media-op', mediaOp);
			write(el.brand, '--brand-op', brandOp);

			// Class toggle only on threshold crossings, not every frame. It
			// flips the corner mark's pointer-events as the mark starts to
			// wake. (It used to turn the hamburger to ink here too; the bars
			// are ink at all times now — style.css 04 NAV TOGGLE.)
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
	   06  ENQUIRY
	   The contact form (index.html 05, style.css 11 CONTACT). Three jobs:

	     · builds the date module — a strip of the next twelve months, a day
	       grid for whichever is chosen, and a "flexible" option — over a
	       hidden field. Without JS the markup keeps a plain text field, so
	       the form is still complete.
	     · checks the form before anything else happens, and says what is
	       wrong in the page rather than in a browser dialog.
	     · hands the finished message to the visitor's own mail app, and says
	       plainly that nothing was sent. THE FORM POSTS NOWHERE — see the
	       note in index.html for how to point it at an endpoint.

	   Two quiet spam checks that cost a person nothing: a honeypot field no
	   one can reach, and the time taken — a bot fills and submits in
	   milliseconds. Both simply drop the message.
	   ====================================================================== */

	function enquiry() {
		var form = document.querySelector('.enquiry');
		if (!form) return;

		var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
			'July', 'August', 'September', 'October', 'November', 'December'];
		var DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
		var MIN_SECONDS = 2000;   // faster than this is not a person
		var openedAt = Date.now();
		var status = form.querySelector('.enquiry__status');

		/* --- the date module ------------------------------------------- */

		function buildDates() {
			var wrap = form.querySelector('[data-date]');
			if (!wrap) return;

			var plain = wrap.querySelector('.field--plain');
			if (plain) plain.parentNode.removeChild(plain);

			var today = new Date();
			today.setHours(0, 0, 0, 0);

			var dates = document.createElement('div');
			dates.className = 'dates';

			var strip = document.createElement('div');
			strip.className = 'dates__months';
			strip.setAttribute('role', 'group');
			strip.setAttribute('aria-label', 'Month');

			var grid = document.createElement('div');
			grid.className = 'dates__days';
			grid.hidden = true;

			var chosen = document.createElement('p');
			chosen.className = 'dates__chosen';
			chosen.setAttribute('aria-live', 'polite');

			var value = document.createElement('input');
			value.type = 'hidden';
			value.name = 'date';

			var flex = document.createElement('button');
			flex.type = 'button';
			flex.className = 'dates__flex';
			flex.setAttribute('aria-pressed', 'false');
			flex.appendChild(document.createTextNode('Flexible'));
			strip.appendChild(flex);

			function press(node, on) {
				node.setAttribute('aria-pressed', on ? 'true' : 'false');
			}

			function clearPressed(selector) {
				Array.prototype.forEach.call(dates.querySelectorAll(selector), function (n) {
					press(n, false);
				});
			}

			function say(text) {
				chosen.textContent = text;
				value.value = text;
			}

			flex.addEventListener('click', function () {
				clearPressed('.dates__month');
				grid.hidden = true;
				press(flex, true);
				say('Flexible');
			});

			// Twelve months from this one
			for (var i = 0; i < 12; i++) {
				(function (offset) {
					var when = new Date(today.getFullYear(), today.getMonth() + offset, 1);
					var button = document.createElement('button');
					button.type = 'button';
					button.className = 'dates__month';
					button.setAttribute('aria-pressed', 'false');
					button.setAttribute('aria-label', MONTHS[when.getMonth()] + ' ' + when.getFullYear());
					button.appendChild(document.createTextNode(
						MONTHS[when.getMonth()].slice(0, 3) + ' ' + String(when.getFullYear()).slice(2)
					));

					button.addEventListener('click', function () {
						clearPressed('.dates__month');
						press(flex, false);
						press(button, true);
						buildDays(when);
						say(MONTHS[when.getMonth()] + ' ' + when.getFullYear());
					});

					strip.appendChild(button);
				})(i);
			}

			function buildDays(month) {
				grid.innerHTML = '';
				grid.hidden = false;

				DOW.forEach(function (letter, n) {
					var head = document.createElement('span');
					head.className = 'dates__dow';
					head.setAttribute('aria-hidden', 'true');
					head.appendChild(document.createTextNode(letter));
					grid.appendChild(head);
					return n;
				});

				// Monday-first: JS makes Sunday 0, so shift it to the end
				var first = new Date(month.getFullYear(), month.getMonth(), 1);
				var lead = (first.getDay() + 6) % 7;
				var days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();

				for (var b = 0; b < lead; b++) {
					grid.appendChild(document.createElement('span'));
				}

				for (var d = 1; d <= days; d++) {
					(function (day) {
						var date = new Date(month.getFullYear(), month.getMonth(), day);
						var button = document.createElement('button');
						button.type = 'button';
						button.className = 'dates__day';
						button.appendChild(document.createTextNode(String(day)));

						if (date < today) {
							button.disabled = true;
						} else {
							var label = day + ' ' + MONTHS[month.getMonth()] + ' ' + month.getFullYear();
							button.setAttribute('aria-pressed', 'false');
							button.setAttribute('aria-label', label);
							button.addEventListener('click', function () {
								clearPressed('.dates__day');
								press(button, true);
								say(label);
							});
						}

						grid.appendChild(button);
					})(d);
				}
			}

			dates.appendChild(strip);
			dates.appendChild(grid);
			dates.appendChild(chosen);
			dates.appendChild(value);
			wrap.appendChild(dates);
		}

		/* --- checking --------------------------------------------------- */

		// Deliberately loose: something, an @, something, a dot, something.
		// Anything stricter rejects addresses that are perfectly valid.
		var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

		function fieldOf(input) {
			return input.closest ? input.closest('.field') : input.parentNode;
		}

		function clearError(input) {
			input.removeAttribute('aria-invalid');
			input.removeAttribute('aria-describedby');
			var field = fieldOf(input);
			var note = field && field.querySelector('.field__note');
			if (note) note.parentNode.removeChild(note);
		}

		function setError(input, message) {
			clearError(input);
			var field = fieldOf(input);
			if (!field) return;

			var note = document.createElement('span');
			note.className = 'field__note';
			note.id = input.id + '-note';
			note.appendChild(document.createTextNode(message));

			input.setAttribute('aria-invalid', 'true');
			input.setAttribute('aria-describedby', note.id);
			field.appendChild(note);
		}

		function check() {
			var problems = [];

			[
				[form.querySelector('#f-name'), function (v) { return v.length > 1; }, 'Your name, so the reply has somewhere to go.'],
				[form.querySelector('#f-email'), function (v) { return EMAIL.test(v); }, 'An address I can reach you at.'],
				[form.querySelector('#f-message'), function (v) { return v.length > 9; }, 'A line or two about the work.']
			].forEach(function (rule) {
				var input = rule[0];
				if (!input) return;
				if (rule[1](input.value.trim())) clearError(input);
				else {
					setError(input, rule[2]);
					problems.push(input);
				}
			});

			return problems;
		}

		Array.prototype.forEach.call(form.querySelectorAll('input, textarea'), function (input) {
			input.addEventListener('input', function () {
				if (input.getAttribute('aria-invalid')) clearError(input);
			});
		});

		/* --- sending ----------------------------------------------------- */

		function collect() {
			var lines = [];
			var data = new FormData(form);

			[['name', 'Name'], ['email', 'Email'], ['location', 'Location'], ['date', 'When']].forEach(function (pair) {
				var v = (data.get(pair[0]) || '').toString().trim();
				if (v) lines.push(pair[1] + ': ' + v);
			});

			[['work', 'Work'], ['heard', 'Found me via']].forEach(function (pair) {
				var all = data.getAll(pair[0]).join(', ');
				if (all) lines.push(pair[1] + ': ' + all);
			});

			var message = (data.get('message') || '').toString().trim();
			if (message) lines.push('', message);

			return lines.join('\n');
		}

		function tell(text, linkText, href) {
			status.className = 'enquiry__status';
			status.textContent = text;

			if (!href) return;
			status.appendChild(document.createTextNode(' '));

			var link = document.createElement('a');
			link.href = href;
			link.appendChild(document.createTextNode(linkText));
			status.appendChild(link);
		}

		form.addEventListener('submit', function (e) {
			e.preventDefault();   // nothing to post to yet

			var trap = form.querySelector('#f-website');
			var tooQuick = Date.now() - openedAt < MIN_SECONDS;

			// A bot: say the same thing a person would see, do nothing at all
			if ((trap && trap.value) || tooQuick) {
				tell('Thank you — that has been noted.');
				return;
			}

			var problems = check();
			if (problems.length) {
				status.className = 'enquiry__status enquiry__status--warn';
				status.textContent = problems.length === 1
					? 'One field needs a moment.'
					: problems.length + ' fields need a moment.';
				problems[0].focus();
				return;
			}

			var subject = 'Enquiry — ' + (form.querySelector('#f-name').value.trim() || 'Capturedbytiffany');
			var href = 'mailto:hello@capturedbytiffany.com.au'
				+ '?subject=' + encodeURIComponent(subject)
				+ '&body=' + encodeURIComponent(collect());

			tell('This form is not connected yet, so nothing was sent.', 'Send it from your mail app instead', href);
		});

		buildDates();
	}

	/* ======================================================================
	   07  INIT
	   ====================================================================== */

	function init() {
		intro();
		nav();
		handoff();
		reveal();
		enquiry();
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}

})();
