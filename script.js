/* ============================================================
   BOMB ATTACK
   - Core logic preserved: secret number 1..10, 10s fuse,
     higher/lower hints, win/lose, explosion sound.
   - Rebuilt presentation: smooth rAF loop, animated fuse +
     flame, canvas particle engine, dramatic explosion.
   ============================================================ */

(() => {
    'use strict';

    // ---- Config -------------------------------------------------
    const DURATION = 10;        // seconds on the fuse
    const MIN = 1, MAX = 10;    // valid guess range

    // ---- DOM ----------------------------------------------------
    const $ = (id) => document.getElementById(id);
    const els = {
        game: $('game'),
        timer: $('timer'),
        ring: $('ring'),
        time: $('time'),
        bombWrap: $('bombWrap'),
        bomb: $('bomb'),
        fuseLive: $('fuseLive'),
        flame: $('flame'),
        hint: $('hint'),
        hintIcon: $('hintIcon'),
        hintText: $('hintText'),
        entry: $('entry'),
        guess: $('guess'),
        submit: $('submit'),
        guesses: $('guesses'),
        overlay: $('overlay'),
        overlayCard: $('overlayCard'),
        overlayEmoji: $('overlayEmoji'),
        overlayTitle: $('overlayTitle'),
        overlayMsg: $('overlayMsg'),
        again: $('again'),
        flash: $('flash'),
        canvas: $('fx'),
    };

    const RING_LEN = 2 * Math.PI * 54; // matches r=54 in the SVG
    els.ring.style.strokeDasharray = RING_LEN;

    const audio = new Audio('explosion.mp3');
    audio.preload = 'auto';

    // ---- Particle engine ---------------------------------------
    const fx = new ParticleFX(els.canvas);

    // ---- Game state --------------------------------------------
    let pin, remaining, running, lastTs, rafId, soundPlayed;

    // Geometry of the fuse path (for flame placement / spark origin)
    const fuseLen = els.fuseLive.getTotalLength();
    els.fuseLive.style.strokeDasharray = fuseLen;

    function reset() {
        pin = Math.floor(Math.random() * MAX) + 1;   // 1..10  (preserved logic)
        remaining = DURATION;
        running = true;
        soundPlayed = false;
        lastTs = null;

        els.bombWrap.classList.remove('gone');
        els.flame.classList.add('lit');
        els.guesses.innerHTML = '';
        setHint('idle', '⌨', 'Type a number and hit Enter');

        els.guess.value = '';
        els.guess.disabled = false;
        els.submit.disabled = false;

        els.overlay.hidden = true;
        document.documentElement.style.setProperty('--tension', '0');

        updateVisuals(1);          // fraction = 1 (full)
        focusInput();

        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(loop);
    }

    // ---- Main loop ---------------------------------------------
    function loop(ts) {
        if (lastTs == null) lastTs = ts;
        const dt = Math.min(0.05, (ts - lastTs) / 1000); // clamp big gaps
        lastTs = ts;

        if (running) {
            remaining = Math.max(0, remaining - dt);
            const frac = remaining / DURATION;
            updateVisuals(frac);
            emitFuseSparks(frac, dt);

            if (remaining <= 0) {
                explode();
                return;
            }
        }
        fx.step(dt);
        rafId = requestAnimationFrame(loop);
    }

    // ---- Visual mapping ----------------------------------------
    function updateVisuals(frac) {
        const tension = 1 - frac;            // 0 -> 1
        const secs = Math.ceil(remaining - 1e-4);

        // timer number + ring
        els.time.textContent = Math.max(0, secs);
        els.ring.style.strokeDashoffset = RING_LEN * (1 - frac);

        // color zone
        let zone = 'safe';
        if (frac <= 0.3) zone = 'danger';
        else if (frac <= 0.6) zone = 'warn';
        els.timer.dataset.zone = zone;

        // global danger tension (vignette, bomb glow)
        document.documentElement.style.setProperty('--tension', tension.toFixed(3));

        // fuse burn-down: unburnt length shrinks toward the bomb (offset 0)
        els.fuseLive.style.strokeDashoffset = fuseLen * (1 - frac);

        // place flame at the burning tip
        const pt = els.fuseLive.getPointAtLength(fuseLen * frac);
        const svg = els.fuseLive.ownerSVGElement;
        const vb = svg.viewBox.baseVal;
        const rect = svg.getBoundingClientRect();
        const wrapRect = els.bombWrap.getBoundingClientRect();
        const px = (pt.x / vb.width) * rect.width + (rect.left - wrapRect.left);
        const py = (pt.y / vb.height) * rect.height + (rect.top - wrapRect.top);
        els.flame.style.left = px + 'px';
        els.flame.style.top = py + 'px';
        els.flame.style.setProperty('--flame-scale', (0.85 + tension * 0.9).toFixed(2));
        els._flameXY = { px, py, rect, wrapRect, vb, svg };

        // bomb shake — grows sharply near the end
        if (running && tension > 0.45) {
            const amp = (tension - 0.45) / 0.55 * 6;   // up to ~6px
            els.bombWrap.style.setProperty('--bx', rand(-amp, amp).toFixed(1) + 'px');
            els.bombWrap.style.setProperty('--by', rand(-amp, amp).toFixed(1) + 'px');
            els.bombWrap.style.setProperty('--br', rand(-amp, amp).toFixed(1) * 0.3 + 'deg');
        } else {
            els.bombWrap.style.setProperty('--bx', '0px');
            els.bombWrap.style.setProperty('--by', '0px');
            els.bombWrap.style.setProperty('--br', '0deg');
        }
    }

    // spark emission rate scales with tension
    let sparkAcc = 0;
    function emitFuseSparks(frac, dt) {
        const xy = els._flameXY;
        if (!xy) return;
        const tension = 1 - frac;
        const rate = 30 + tension * 90;            // sparks / sec
        sparkAcc += rate * dt;
        // convert flame position (relative to bombWrap) to viewport coords for canvas
        const wrap = els.bombWrap.getBoundingClientRect();
        const ox = wrap.left + xy.px;
        const oy = wrap.top + xy.py;
        while (sparkAcc >= 1) {
            sparkAcc -= 1;
            fx.spark(ox, oy, tension);
        }
    }

    // ---- Guess handling ----------------------------------------
    function submitGuess(e) {
        if (e) e.preventDefault();
        if (!running) return;

        const raw = els.guess.value.trim();
        const val = parseInt(raw, 10);

        if (raw === '' || Number.isNaN(val) || val < MIN || val > MAX) {
            setHint('bad', '⚠', `Enter a whole number ${MIN}–${MAX}`);
            els.guess.classList.remove('flash-bad');
            void els.guess.offsetWidth;            // restart animation
            els.guess.classList.add('flash-bad');
            els.guess.value = '';
            focusInput();
            return;
        }

        if (val === pin) {                          // win (instant)
            win();
            return;
        }

        // higher / lower (preserved "Smaller/Bigger" meaning)
        if (val > pin) {
            setHint('down', '⬇', `Too high — go lower than ${val}`);
            addChip(val, 'down');
        } else {
            setHint('up', '⬆', `Too low — go higher than ${val}`);
            addChip(val, 'up');
        }

        els.guess.value = '';
        focusInput();
    }

    function addChip(val, dir) {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.dataset.dir = dir;
        chip.textContent = (dir === 'down' ? '↓ ' : '↑ ') + val;
        els.guesses.appendChild(chip);
    }

    function setHint(state, icon, text) {
        els.hint.dataset.state = state;
        els.hintIcon.textContent = icon;
        els.hintText.textContent = text;
        if (state === 'bad') {
            els.hint.classList.remove('shake');
            void els.hint.offsetWidth;
        }
    }

    // ---- End states --------------------------------------------
    function win() {
        running = false;
        cancelAnimationFrame(rafId);
        els.flame.classList.remove('lit');
        els.bombWrap.style.setProperty('--bx', '0px');
        els.bombWrap.style.setProperty('--by', '0px');
        els.bombWrap.style.setProperty('--br', '0deg');
        document.documentElement.style.setProperty('--tension', '0');
        els.timer.dataset.zone = 'safe';

        // keep particle loop alive briefly for confetti
        fx.confetti();
        let t = 0;
        const tick = (ts) => {
            if (lastTs == null) lastTs = ts;
            const dt = Math.min(0.05, (ts - lastTs) / 1000); lastTs = ts;
            t += dt; fx.step(dt);
            if (t < 2.5) rafId = requestAnimationFrame(tick);
        };
        lastTs = null;
        rafId = requestAnimationFrame(tick);

        showResult('win', '🎉', 'Defused!', `Spot on — the number was <b>${pin}</b>.`);
    }

    function explode() {
        running = false;
        if (!soundPlayed) { audio.currentTime = 0; audio.play().catch(() => {}); soundPlayed = true; }

        els.flame.classList.remove('lit');
        const wrap = els.bombWrap.getBoundingClientRect();
        const cx = wrap.left + wrap.width / 2;
        const cy = wrap.top + wrap.height / 2;

        fx.explode(cx, cy);
        screenFlash();
        screenShake();
        els.bombWrap.classList.add('gone');
        document.documentElement.style.setProperty('--tension', '0');

        // run the particle loop down, then show result
        lastTs = null;
        let t = 0;
        const tick = (ts) => {
            if (lastTs == null) lastTs = ts;
            const dt = Math.min(0.05, (ts - lastTs) / 1000); lastTs = ts;
            t += dt; fx.step(dt);
            if (t < 3) rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);

        setTimeout(() => showResult('lose', '💥', 'Boom!', `Out of time! The number was <b>${pin}</b>.`), 750);
    }

    function showResult(result, emoji, title, msg) {
        els.guess.disabled = true;
        els.submit.disabled = true;
        els.overlayCard.dataset.result = result;
        els.overlayEmoji.textContent = emoji;
        els.overlayTitle.textContent = title;
        els.overlayMsg.innerHTML = msg;
        els.overlay.hidden = false;
        els.again.focus();
    }

    // ---- Screen effects ----------------------------------------
    function screenFlash() {
        els.flash.style.transition = 'none';
        els.flash.style.opacity = '0.9';
        requestAnimationFrame(() => {
            els.flash.style.transition = 'opacity .5s ease-out';
            els.flash.style.opacity = '0';
        });
    }

    function screenShake() {
        const g = els.game;
        const start = performance.now();
        const dur = 600;
        const anim = (now) => {
            const k = (now - start) / dur;
            if (k >= 1) { g.style.transform = ''; return; }
            const decay = (1 - k);
            const amp = 22 * decay * decay;
            g.style.transform =
                `translate(${rand(-amp, amp)}px, ${rand(-amp, amp)}px) rotate(${rand(-amp, amp) * 0.08}deg)`;
            requestAnimationFrame(anim);
        };
        requestAnimationFrame(anim);
    }

    function focusInput() {
        // keep keyboard flow tight; defer so it survives the current event
        requestAnimationFrame(() => els.guess.focus({ preventScroll: true }));
    }

    // ---- Input restriction (numbers, 1..10) --------------------
    els.guess.addEventListener('input', () => {
        let v = els.guess.value.replace(/[^0-9]/g, '');
        if (v.length > 2) v = v.slice(0, 2);
        if (v !== '' && parseInt(v, 10) > MAX) v = String(MAX);
        if (v === '0') v = '';                  // 0 is out of range; block leading 0
        els.guess.value = v;
    });
    els.guess.addEventListener('keydown', (e) => {
        // allow control keys; block stray letters that slip past inputmode
        const ok = ['Backspace', 'Delete', 'Tab', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
        if (ok.includes(e.key) || e.ctrlKey || e.metaKey) return;
        if (!/^[0-9]$/.test(e.key)) e.preventDefault();
    });

    els.entry.addEventListener('submit', submitGuess);
    els.again.addEventListener('click', reset);

    // Enter on the overlay restarts
    document.addEventListener('keydown', (e) => {
        if (!els.overlay.hidden && e.key === 'Enter') { e.preventDefault(); reset(); }
    });

    // keep input focused on the whole stage (rapid guessing)
    els.game.addEventListener('click', () => { if (running) focusInput(); });

    window.addEventListener('resize', () => fx.resize());

    // ---- Go -----------------------------------------------------
    reset();

    // ============================================================
    //  Helpers
    // ============================================================
    function rand(a, b) { return a + Math.random() * (b - a); }

    // ============================================================
    //  ParticleFX — lightweight canvas particle system
    // ============================================================
    function ParticleFX(canvas) {
        const ctx = canvas.getContext('2d');
        let W = 0, H = 0, DPR = 1;
        const parts = [];
        const rings = [];

        resize();

        function resize() {
            DPR = Math.min(2, window.devicePixelRatio || 1);
            // clientWidth/clientHeight are read-only getters — never assign to them.
            // The element is sized to the viewport by CSS (#fx { width:100%; height:100% });
            // here we only set the backing drawing buffer for crisp, DPR-aware rendering.
            W = window.innerWidth;
            H = window.innerHeight;
            canvas.width = Math.floor(W * DPR);
            canvas.height = Math.floor(H * DPR);
            ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        }

        function add(p) { if (parts.length < 1400) parts.push(p); }

        // small fuse spark
        function spark(x, y, tension) {
            const a = rand(0, Math.PI * 2);
            const sp = rand(20, 70) * (0.6 + tension);
            add({
                x, y,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp - rand(10, 40),
                life: rand(0.3, 0.7), age: 0,
                size: rand(1, 2.6),
                g: 120,
                color: pick(['#fff3c4', '#ffd166', '#ff8c1a', '#ff5a3c']),
                kind: 'spark',
            });
        }

        function explode(x, y) {
            // flash core
            rings.push({ x, y, r: 8, max: Math.max(W, H) * 0.5, life: 0.6, age: 0, w: 26, color: '255,180,80' });
            rings.push({ x, y, r: 4, max: Math.max(W, H) * 0.38, life: 0.45, age: 0, w: 14, color: '255,255,255' });

            // fireball sparks
            for (let i = 0; i < 140; i++) {
                const a = rand(0, Math.PI * 2);
                const sp = rand(60, 520);
                add({
                    x, y,
                    vx: Math.cos(a) * sp,
                    vy: Math.sin(a) * sp,
                    life: rand(0.5, 1.2), age: 0,
                    size: rand(1.5, 4.5),
                    g: 200,
                    color: pick(['#fff', '#ffe08a', '#ffae42', '#ff6a2b', '#ff3b2b']),
                    kind: 'spark',
                });
            }
            // debris chunks
            for (let i = 0; i < 26; i++) {
                const a = rand(0, Math.PI * 2);
                const sp = rand(120, 460);
                add({
                    x, y,
                    vx: Math.cos(a) * sp,
                    vy: Math.sin(a) * sp - rand(40, 120),
                    life: rand(1, 1.8), age: 0,
                    size: rand(3, 7),
                    g: 620,
                    rot: rand(0, 6.28), vr: rand(-12, 12),
                    color: pick(['#2b2f3a', '#3c4150', '#1a1d25', '#54402c']),
                    kind: 'debris',
                });
            }
            // smoke
            for (let i = 0; i < 30; i++) {
                const a = rand(0, Math.PI * 2);
                const sp = rand(10, 120);
                add({
                    x, y,
                    vx: Math.cos(a) * sp,
                    vy: Math.sin(a) * sp - rand(20, 70),
                    life: rand(1.4, 2.6), age: 0,
                    size: rand(26, 60),
                    g: -20,
                    color: '60,60,66',
                    kind: 'smoke',
                });
            }
        }

        function confetti() {
            const colors = ['#36d399', '#ffd166', '#5aa0ff', '#ff6ad5', '#fff', '#ffae42'];
            for (let i = 0; i < 140; i++) {
                add({
                    x: rand(0, W), y: rand(-40, -4),
                    vx: rand(-40, 40), vy: rand(40, 160),
                    life: rand(2, 3.2), age: 0,
                    size: rand(4, 8),
                    g: 60,
                    rot: rand(0, 6.28), vr: rand(-10, 10),
                    color: colors[i % colors.length],
                    kind: 'confetti',
                });
            }
        }

        function step(dt) {
            ctx.clearRect(0, 0, W, H);

            // shockwave rings
            for (let i = rings.length - 1; i >= 0; i--) {
                const r = rings[i];
                r.age += dt;
                const k = r.age / r.life;
                if (k >= 1) { rings.splice(i, 1); continue; }
                r.r = r.max * easeOut(k);
                ctx.beginPath();
                ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
                ctx.lineWidth = r.w * (1 - k);
                ctx.strokeStyle = `rgba(${r.color},${(1 - k) * 0.8})`;
                ctx.stroke();
            }

            // particles
            for (let i = parts.length - 1; i >= 0; i--) {
                const p = parts[i];
                p.age += dt;
                if (p.age >= p.life) { parts.splice(i, 1); continue; }
                p.vy += p.g * dt;
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                if (p.vr) p.rot += p.vr * dt;
                const lifeK = 1 - p.age / p.life;

                if (p.kind === 'smoke') {
                    const rr = p.size * (1 + (1 - lifeK) * 1.6);
                    ctx.beginPath();
                    ctx.fillStyle = `rgba(${p.color},${lifeK * 0.35})`;
                    ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
                    ctx.fill();
                } else if (p.kind === 'debris' || p.kind === 'confetti') {
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.rot || 0);
                    ctx.globalAlpha = Math.min(1, lifeK * 1.5);
                    ctx.fillStyle = p.color;
                    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * (p.kind === 'confetti' ? 0.5 : 1));
                    ctx.restore();
                    ctx.globalAlpha = 1;
                } else { // spark
                    ctx.globalAlpha = Math.min(1, lifeK * 1.6);
                    ctx.fillStyle = p.color;
                    ctx.shadowBlur = 8;
                    ctx.shadowColor = p.color;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                    ctx.globalAlpha = 1;
                }
            }
        }

        function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
        function easeOut(k) { return 1 - Math.pow(1 - k, 3); }

        return { spark, explode, confetti, step, resize };
    }
})();
