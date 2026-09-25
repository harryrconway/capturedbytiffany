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
	   The contact form (index.html 05, style.css 11 CONTACT). Two jobs:

	     · checks the form before anything else happens, and says what is
	       wrong in the page rather than in a browser dialog. All six parts
	       are required, and the two chip groups are checked HERE rather than
	       in the markup, because a checkbox's own `required` means THAT box
	       rather than one of a set. Both chip groups are radios, which the
	       browser COULD enforce on its own — but it would do it in a bubble,
	       in its own words, at its own moment, and the four fields around
	       them answer in the page. One voice is worth more than one
	       attribute.
	     · hands the finished message to the visitor's own mail app, and says
	       plainly that nothing was sent. THE FORM POSTS NOWHERE — see the
	       note in index.html for how to point it at an endpoint.
	     · keeps the message box exactly as tall as what is in it, so its rule
	       sits the same distance under the last line as every other field's
	       does. Without JS the box stays at its two-row floor.

	   Two quiet spam checks that cost a person nothing: a honeypot field no
	   one can reach, and the time taken — a bot fills and submits in
	   milliseconds. Both simply drop the message.
	   ====================================================================== */

	function enquiry() {
		var form = document.querySelector('.enquiry');
		if (!form) return;

		var MIN_SECONDS = 2000;   // faster than this is not a person
		var openedAt = Date.now();
		var status = form.querySelector('.enquiry__status');

		/* --- the message box grows -------------------------------------
		   A textarea with a fixed height puts empty lines between the last
		   word typed and the rule under it, which reads as a gap rather than
		   as room — the single-line fields above have no such gap, and this
		   one should not either. So the box is always exactly as tall as what
		   is in it, and its rule sits the same distance under the last line
		   as Name's does under its own. */

		var messageBox = form.querySelector('#f-message');

		if (messageBox) {
			var grow = function () {
				/* auto first, so the box can SHRINK again when text is
				   deleted — scrollHeight can never report less than the
				   height already set. The two-line floor is min-height, in
				   11 CONTACT, which the browser clamps this against: nothing
				   here has to know what a line is worth. The addition is the
				   1px rule, which scrollHeight leaves out and border-box
				   counts in. */
				messageBox.style.height = 'auto';
				messageBox.style.height =
					(messageBox.scrollHeight + messageBox.offsetHeight - messageBox.clientHeight) + 'px';
			};

			messageBox.addEventListener('input', grow);

			/* A narrower box wraps the same words onto more lines. Without
			   this the height set before the turn is kept, and overflow is
			   hidden, so the last lines of a long message would simply
			   vanish on rotation. */
			window.addEventListener('resize', grow);

			grow();
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

		/* --- the two chip groups ----------------------------------------
		   The error hangs on the FIELDSET, which is what the question is,
		   rather than on any one box: the group's legend already names it,
		   and aria-describedby means a screen reader hears the question and
		   then the problem, in that order. The note goes inside the fieldset
		   so it lands under the chips, on the 0.9em gap the block sets. */

		function groupOf(name) {
			return form.querySelector('[data-group="' + name + '"]');
		}

		function clearGroupError(group) {
			group.removeAttribute('aria-describedby');
			var note = group.querySelector('.field__note');
			if (note) note.parentNode.removeChild(note);
		}

		function setGroupError(group, message) {
			clearGroupError(group);

			var note = document.createElement('p');
			note.className = 'field__note';
			note.id = group.getAttribute('data-group') + '-note';
			note.appendChild(document.createTextNode(message));

			/* The attribute is also the CSS hook: 11 CONTACT turns the drawn
			   boxes --warn while it is set, so the group reads as wrong from
			   across the form, not only from the line of red under it. */
			group.setAttribute('aria-describedby', note.id);
			group.appendChild(note);
		}

		function check() {
			var problems = [];

			/* One list, in DOM ORDER — so problems[0] is the first thing on
			   the page that needs attention, and the focus() in the submit
			   handler lands where the eye would go anyway. An array rather
			   than an object: ES5 makes no promise about key order.

			   Every message is lowercase, like the rest of the form, and
			   written around the first person: a lowercase "i" reads as a
			   mistake, so no message contains one. */
			var RULES = [
				['field', '#f-name',    function (v) { return v.length > 1; },  'your name, so the reply has somewhere to go.'],
				['field', '#f-email',   function (v) { return EMAIL.test(v); }, 'an address the reply can go to.'],
				['field', '#f-place',   function (v) { return v.length > 1; },  'where the shoot is, even roughly.'],
				['field', '#f-message', function (v) { return v.length > 9; },  'a line or two about the work.'],
				['group', 'work',       null,                                   'tick at least one, so the quote has something to stand on.'],
				['group', 'heard',      null,                                   'tick at least one — it says where the next month should come from.']
			];

			RULES.forEach(function (rule) {
				if (rule[0] === 'field') {
					var input = form.querySelector(rule[1]);
					if (!input) return;
					if (rule[2](input.value.trim())) clearError(input);
					else {
						setError(input, rule[3]);
						problems.push(input);
					}
					return;
				}

				var group = groupOf(rule[1]);
				if (!group) return;

				var boxes = group.querySelectorAll('.ticks input');
				var any = Array.prototype.some.call(boxes, function (b) { return b.checked; });

				if (any) clearGroupError(group);
				else {
					setGroupError(group, rule[3]);
					/* The focus target is the FIRST box in the group — the one
					   a keyboard reaches first, and the one the page scrolls
					   to. It is visually hidden but absolutely positioned
					   inside its own <li>, so the browser scrolls to the chip
					   rather than to the top of the form. Note that with focus
					   indication removed (style.css 11 CONTACT) this move is
					   SILENT for a sighted keyboard user; it still reaches a
					   screen reader. */
					problems.push(boxes[0]);
				}
			});

			return problems;
		}

		Array.prototype.forEach.call(form.querySelectorAll('input, textarea'), function (input) {
			input.addEventListener('input', function () {
				if (input.getAttribute('aria-invalid')) clearError(input);
			});
		});

		/* Ticking anything in a group answers its complaint immediately — the
		   same courtesy the text fields get from `input` above. closest() is
		   guarded the way fieldOf() guards it.

		   Both groups are radios, so nothing here has to keep one answer to a
		   question — the browser does that. */
		Array.prototype.forEach.call(form.querySelectorAll('.ticks input'), function (box) {
			box.addEventListener('change', function () {
				var group = box.closest
					? box.closest('[data-group]')
					: box.parentNode.parentNode.parentNode;

				if (group && group.getAttribute('aria-describedby')) clearGroupError(group);
			});
		});

		/* --- sending ----------------------------------------------------- */

		/* --- the one exit -------------------------------------------------
		   The mailto URL below is the only place a typed value leaves this
		   page. encodeURIComponent already makes & = ? # < > " inert, so
		   nothing typed can add a mail header or break out of the URL.

		   Control characters are the one class it carries through verbatim,
		   and a decoded CR/LF inside a SUBJECT is the classic mailto header
		   injection against a careless handler. So fold those out — and
		   reject nothing. No character a person might legitimately type is
		   refused: a "<" in a message is a "<". Nothing here is ever parsed
		   as HTML. (Bidi marks stay: they are legitimate for right-to-left
		   writers, and the status line never shows a typed value.)
		   -------------------------------------------------------------- */

		// A subject is one line. Whitespace runs collapse first, so CR and LF
		// become spaces rather than welding two words together.
		function oneLine(value) {
			return value
				.replace(/\s+/g, ' ')
				.replace(/[\u0000-\u001F\u007F]/g, '')
				.slice(0, 120)
				.trim();
		}

		// A body keeps its paragraphs and its tabs, and loses everything else
		// below U+0020.
		function plainText(value) {
			return value
				.replace(/\r\n?/g, '\n')
				.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
		}

		function collect() {
			var lines = [];
			var data = new FormData(form);

			[['name', 'Name'], ['email', 'Email'], ['location', 'Location']].forEach(function (pair) {
				var v = (data.get(pair[0]) || '').toString().trim();
				if (v) lines.push(pair[1] + ': ' + oneLine(v));
			});

			[['work', 'Work'], ['heard', 'Found me via']].forEach(function (pair) {
				var all = data.getAll(pair[0]).join(', ');
				if (all) lines.push(pair[1] + ': ' + oneLine(all));
			});

			var message = (data.get('message') || '').toString().trim();
			if (message) lines.push('', plainText(message));

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
				tell('thank you — that has been noted.');
				return;
			}

			var problems = check();
			if (problems.length) {
				status.className = 'enquiry__status enquiry__status--warn';
				status.textContent = problems.length === 1
					? 'one part needs a moment.'
					: problems.length + ' parts need a moment.';
				problems[0].focus();
				return;
			}

			var MAILTO = 'mailto:hello@capturedbytiffany.com.au';
			var subject = 'Enquiry — ' + (oneLine(form.querySelector('#f-name').value.trim()) || 'Capturedbytiffany');
			var href = MAILTO
				+ '?subject=' + encodeURIComponent(subject)
				+ '&body=' + encodeURIComponent(collect());

			/* Measured: 1200 characters of English make a 1796-character
			   mailto, 1200 of Arabic make 7076, because every letter becomes
			   six percent-escapes. Windows mail handlers cut at about 2048 and
			   open a truncated draft without saying so. Better to open an
			   empty one and say what happened than to lose half a message. */
			if (href.length > 1900) {
				tell('this form is not connected yet, so nothing was sent — and this message is longer than a mail link can carry, so copy it across once your mail app opens.',
					'open your mail app', MAILTO + '?subject=' + encodeURIComponent(subject));
				return;
			}

			tell('this form is not connected yet, so nothing was sent.', 'send it from your mail app instead', href);
		});

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
