/* DoubleUp Studio — playable hero shooter.
   Vanilla JS, no dependencies, no backend. Loaded on the home page only.

   Design rules (from research):
   - Native scroll is NEVER intercepted. The game→home transition is
     scroll-LINKED (we read scrollY and map it to a transform), not hijacked.
   - Desktop: attract mode until PRESS START. Mobile (coarse pointer):
     attract mode until TAP TO PLAY; only then does the stage claim touch.
   - Exits: HP zero (game over → scroll cue + one smooth scroll), the
     persistent EXIT ▼ button, ESC, and plain scrolling at any time.
   - prefers-reduced-motion / missing JS → the static hero, untouched. */
(function () {
  'use strict';

  // ---------------------------------------------------------------- setup --
  var track = document.getElementById('game-track');
  var stage = document.getElementById('game-stage');
  var canvas = document.getElementById('hero-game');
  if (!track || !stage || !canvas || !canvas.getContext) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var ctx = canvas.getContext('2d');
  var coarse = matchMedia('(pointer: coarse)').matches;

  var ui = {
    title: document.getElementById('hero-title'),
    lead: document.getElementById('hero-lead'),
    cta: document.getElementById('hero-cta'),
    startRow: document.getElementById('game-start-row'),
    startBtn: document.getElementById('btn-start'),
    hint: document.getElementById('game-hint'),
    hud: document.getElementById('game-hud'),
    score: document.getElementById('hud-score'),
    best: document.getElementById('hud-best'),
    hp: document.getElementById('hud-hp'),
    mute: document.getElementById('hud-mute'),
    exit: document.getElementById('hud-exit'),
    over: document.getElementById('game-over'),
    overScore: document.getElementById('over-score'),
    overBest: document.getElementById('over-best'),
    restart: document.getElementById('btn-restart'),
    continueBtn: document.getElementById('btn-continue'),
    pause: document.getElementById('game-pause'),
    resume: document.getElementById('btn-resume'),
    seeSite: document.getElementById('btn-seesite'),
    skip: document.getElementById('stage-skip'),
    dim: document.getElementById('stage-dim'),
    content: document.getElementById('content')
  };

  // ------------------------------------------------------------- palette --
  var C = {
    bg: '#0a0c12', sky: '#38bdf8', skyLite: '#7dd3fc', skyDeep: '#0284c7',
    ink: '#e9edf7', dim: '#6d7891', amber: '#ffc94a', lime: '#7bf1a8',
    rose: '#ff6b9d'
  };

  // ------------------------------------------------------------- sprites --
  // Pixel-matrix sprites rendered once to offscreen canvases. No PNGs.
  var PAL = { a: C.sky, b: C.skyLite, w: C.ink, f: C.amber, r: C.rose, y: C.amber, l: C.lime, d: C.skyDeep, k: '#111726' };

  var ART = {
    ship: [
      '.....aa.....',
      '....abba....',
      '....abba....',
      '...abbbba...',
      '...abwwba...',
      '...abwwba...',
      '..aabbbbaa..',
      '..ababbaba..',
      '.aa.abba.aa.',
      '.a..abba..a.',
      'aa..abba..aa',
      'a...aaaa...a'
    ],
    flame0: ['.ff.', 'ffff', '.ff.', '..f.'],
    flame1: ['.ff.', '.ff.', 'f..f', '.f..'],
    drone: [
      '..r....r..',
      '...r..r...',
      '..rrrrrr..',
      '.rr.rr.rr.',
      'rrrrrrrrrr',
      'r.rrrrrr.r',
      'r.r....r.r',
      '...r..r...'
    ],
    dart: [
      '...y...',
      '..yyy..',
      '..yyy..',
      '.yyyyy.',
      '.y.y.y.',
      'yy.y.yy',
      '.y...y.'
    ],
    tank: [
      '..l.........l..',
      '..ll.......ll..',
      '..lllllllllll..',
      '.lll.wwwww.lll.',
      'llll.w.k.w.llll',
      'l.lllwwwwwlll.l',
      'l..lllllllll..l',
      'l...ll...ll...l',
      '....l.....l....'
    ]
  };

  function makeSprite(rows) {
    var w = rows[0].length, h = rows.length;
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    var c = cv.getContext('2d');
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var ch = rows[y][x];
        if (ch !== '.') { c.fillStyle = PAL[ch] || C.ink; c.fillRect(x, y, 1, 1); }
      }
    }
    return cv;
  }
  var SPR = {};
  for (var k in ART) SPR[k] = makeSprite(ART[k]);

  // --------------------------------------------------------------- state --
  var VW = 480, VH = 270;        // internal resolution, recomputed on resize
  var scale = 2;                 // css px per internal px
  var state = 'attract';         // attract | playing | paused | gameover
  var running = false;           // rAF active (visible + tab focused + near top)
  var rafId = 0, last = 0, acc = 0, elapsed = 0;
  var STEP = 1000 / 60;
  var ioVisible = true, scrollOK = true;
  var autoScrolled = false;      // one smooth scroll per death, max

  var ship = { x: 0, y: 0, hp: 3, fire: 0, invuln: 0, flame: 0 };
  var bullets = [], ebullets = [], enemies = [], parts = [], stars = [];
  var score = 0, best = 0, spawnT = 0, diff = 1;
  var keys = {};
  var pointer = { active: false, x: 0, y: 0 };   // desktop mouse steering
  var dragId = -1, dragX = 0, dragY = 0;          // mobile relative drag
  var pauseTimer = 0;
  var targets = [];               // destructible DOM glyphs / stars
  var muted = false;

  try { best = +localStorage.getItem('dus-best') || 0; muted = localStorage.getItem('dus-mute') === '1'; } catch (e) {}

  // --------------------------------------------------------------- audio --
  var actx = null;
  function sfx(kind) {
    if (muted) return;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      var t = actx.currentTime;
      var o = actx.createOscillator(), g = actx.createGain();
      o.connect(g); g.connect(actx.destination);
      var f0 = 880, f1 = 440, dur = 0.06, vol = 0.02, type = 'square';
      if (kind === 'shoot') { f0 = 920; f1 = 640; dur = 0.045; vol = 0.012; }
      else if (kind === 'hit') { f0 = 300; f1 = 90; dur = 0.12; vol = 0.03; type = 'sawtooth'; }
      else if (kind === 'glyph') { f0 = 1300; f1 = 1800; dur = 0.07; vol = 0.025; type = 'triangle'; }
      else if (kind === 'hurt') { f0 = 220; f1 = 60; dur = 0.25; vol = 0.04; }
      else if (kind === 'over') { f0 = 330; f1 = 40; dur = 0.7; vol = 0.05; type = 'triangle'; }
      else if (kind === 'start') { f0 = 440; f1 = 990; dur = 0.18; vol = 0.03; type = 'triangle'; }
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }
  function setMute(m) {
    muted = m;
    ui.mute.textContent = muted ? 'SOUND OFF' : 'SOUND ON';
    ui.mute.setAttribute('aria-pressed', String(muted));
    try { localStorage.setItem('dus-mute', muted ? '1' : '0'); } catch (e) {}
  }

  // ------------------------------------------------------------- resize --
  function resize() {
    var w = stage.clientWidth, h = stage.clientHeight;
    scale = Math.max(2, Math.round(h / 270));
    VW = Math.ceil(w / scale); VH = Math.ceil(h / scale);
    canvas.width = VW; canvas.height = VH;
    canvas.style.width = (VW * scale) + 'px';
    canvas.style.height = (VH * scale) + 'px';
    canvas.style.left = Math.floor((w - VW * scale) / 2) + 'px';
    canvas.style.top = Math.floor((h - VH * scale) / 2) + 'px';
    ctx.imageSmoothingEnabled = false;
    makeStars();
    clampShip();
    cacheRects();
    measureTrack();
  }

  function makeStars() {
    stars.length = 0;
    var n = Math.floor(VW * VH / 1400);
    for (var i = 0; i < n; i++) {
      var layer = i % 3;
      stars.push({
        x: Math.random() * VW, y: Math.random() * VH,
        v: 8 + layer * 14,
        c: layer === 2 ? C.dim : (layer === 1 ? '#3d4966' : '#232c42')
      });
    }
  }

  // ------------------------------------------------- destructible layer --
  function splitGlyphs() {
    if (!ui.title || ui.title.dataset.split) return;
    ui.title.setAttribute('aria-label', ui.title.textContent.replace(/\s+/g, ' ').trim());
    ui.title.dataset.split = '1';
    (function walk(node) {
      var kids = Array.prototype.slice.call(node.childNodes);
      kids.forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          Array.prototype.forEach.call(n.textContent, function (chr) {
            if (!chr.trim()) { frag.appendChild(document.createTextNode(chr)); return; }
            var s = document.createElement('span');
            s.className = 'glyph';
            s.setAttribute('aria-hidden', 'true');
            s.textContent = chr;
            frag.appendChild(s);
          });
          n.parentNode.replaceChild(frag, n);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
      });
    })(ui.title);
  }

  function makePixelStars() {
    for (var i = 0; i < 7; i++) {
      var s = document.createElement('span');
      s.className = 'pixel-star';
      s.setAttribute('aria-hidden', 'true');
      s.style.left = (6 + Math.random() * 88) + '%';
      s.style.top = (10 + Math.random() * 26) + '%';
      s.style.animationDelay = (Math.random() * 3).toFixed(2) + 's';
      stage.appendChild(s);
    }
  }

  function collectTargets() {
    targets.length = 0;
    var els = stage.querySelectorAll('.glyph, .pixel-star');
    Array.prototype.forEach.call(els, function (el) {
      targets.push({
        el: el, alive: true, respawnAt: 0,
        pts: el.classList.contains('glyph') ? 50 : 20,
        x0: 0, y0: 0, x1: 0, y1: 0
      });
    });
    cacheRects();
  }

  function cacheRects() {
    if (!targets.length) return;
    var cr = canvas.getBoundingClientRect();
    if (!cr.width) return;
    var s = cr.width / canvas.width;
    targets.forEach(function (t) {
      var r = t.el.getBoundingClientRect();
      t.x0 = (r.left - cr.left) / s; t.y0 = (r.top - cr.top) / s;
      t.x1 = (r.right - cr.left) / s; t.y1 = (r.bottom - cr.top) / s;
    });
  }

  function destroyTarget(t, bx, by) {
    t.alive = false;
    t.respawnAt = elapsed + 8;
    t.el.classList.remove('back');
    t.el.classList.add('hit');
    addScore(t.pts);
    boom(bx, by, t.el.classList.contains('glyph') ? C.skyLite : C.amber, 10);
    sfx('glyph');
  }

  function respawnTargets(force) {
    targets.forEach(function (t) {
      if (t.alive) return;
      if (force || elapsed >= t.respawnAt) {
        t.alive = true;
        t.el.classList.remove('hit');
        if (!force) {
          t.el.classList.add('back');
          (function (el) { setTimeout(function () { el.classList.remove('back'); }, 700); })(t.el);
        }
      }
    });
  }

  // -------------------------------------------------------------- helpers --
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function clampShip() {
    var topPad = Math.ceil(84 / scale); // keep below the sticky header line
    ship.x = clamp(ship.x, 8, VW - 8);
    ship.y = clamp(ship.y, topPad, VH - 10);
  }
  function boom(x, y, color, n) {
    for (var i = 0; i < n; i++) {
      parts.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 130, vy: (Math.random() - 0.5) * 130,
        life: 0.35 + Math.random() * 0.4, c: color
      });
    }
  }
  function addScore(n) {
    score += n;
    ui.score.textContent = 'SCORE ' + score;
    if (score > best) { best = score; ui.best.textContent = 'BEST ' + best; }
  }
  function drawHP() {
    var s = '';
    for (var i = 0; i < 3; i++) s += i < ship.hp ? '█' : '░';
    ui.hp.textContent = 'HP ' + s;
  }

  // -------------------------------------------------------------- enemies --
  function spawnEnemy() {
    var r = Math.random() * (diff >= 2 ? 3 : diff >= 1.4 ? 2.4 : 1.8);
    var x = 14 + Math.random() * (VW - 28);
    if (r < 1.8) {
      enemies.push({ t: 0, x: x, y: -10, bx: x, ph: Math.random() * 6.3, hp: 1, r: 5, pts: 100, fire: 0 });
    } else if (r < 2.4) {
      enemies.push({ t: 1, x: x, y: -10, vx: 0, hp: 1, r: 4, pts: 150, fire: 0 });
    } else {
      enemies.push({ t: 2, x: x, y: -12, hp: 3, r: 7, pts: 300, fire: 1.4 + Math.random() });
    }
  }

  function updateEnemies(dt) {
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      if (e.t === 0) {          // drone: sine descent
        e.y += 34 * diff * dt;
        e.x = e.bx + Math.sin(e.y * 0.045 + e.ph) * 34;
      } else if (e.t === 1) {   // dart: fast dive, light homing
        e.y += 96 * diff * dt;
        e.vx = clamp(e.vx + (ship.x > e.x ? 90 : -90) * dt, -70, 70);
        e.x = clamp(e.x + e.vx * dt, 6, VW - 6);
      } else {                  // tank: slow, aimed shots
        e.y += 17 * diff * dt;
        e.fire -= dt;
        if (e.fire <= 0 && state === 'playing' && e.y > 0 && e.y < VH - 40) {
          e.fire = 2.4 / diff;
          var dx = ship.x - e.x, dy = ship.y - e.y;
          var len = Math.hypot(dx, dy) || 1;
          ebullets.push({ x: e.x, y: e.y + 4, vx: dx / len * 78, vy: dy / len * 78 });
        }
      }
      if (e.y > VH + 14) enemies.splice(i, 1);
    }
  }

  // --------------------------------------------------------------- update --
  function update(dt) {
    elapsed += dt;

    // starfield always drifts (attract included)
    for (var i = 0; i < stars.length; i++) {
      var st = stars[i];
      st.y += st.v * dt;
      if (st.y > VH) { st.y = -1; st.x = Math.random() * VW; }
    }

    if (state === 'paused' || state === 'gameover') {
      updateParts(dt);
      return;
    }

    diff = Math.min(1 + elapsed / 45, 2.6);
    ship.flame += dt;

    // --- ship control
    if (state === 'attract') {
      ship.x += ((VW / 2 + Math.sin(elapsed * 0.8) * VW * 0.3) - ship.x) * 3 * dt;
      ship.y += ((VH * 0.72) - ship.y) * 2 * dt;
    } else {
      var spd = 200;
      var mvx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
      var mvy = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
      if (mvx || mvy) {
        pointer.active = false;
        ship.x += mvx * spd * dt;
        ship.y += mvy * spd * dt;
      } else if (pointer.active && !coarse) {
        ship.x += (pointer.x - ship.x) * 14 * dt;
        ship.y += (pointer.y - ship.y) * 14 * dt;
      }
      if (dragX || dragY) { ship.x += dragX; ship.y += dragY; dragX = dragY = 0; }
    }
    clampShip();

    // --- auto-fire
    ship.fire -= dt;
    if (ship.fire <= 0) {
      ship.fire = 0.16;
      bullets.push({ x: ship.x, y: ship.y - 8 });
      if (state === 'playing') sfx('shoot');
    }

    // --- bullets
    for (i = bullets.length - 1; i >= 0; i--) {
      bullets[i].y -= 340 * dt;
      if (bullets[i].y < -8) bullets.splice(i, 1);
    }
    for (i = ebullets.length - 1; i >= 0; i--) {
      var eb = ebullets[i];
      eb.x += eb.vx * dt; eb.y += eb.vy * dt;
      if (eb.y > VH + 8 || eb.y < -8 || eb.x < -8 || eb.x > VW + 8) ebullets.splice(i, 1);
    }

    // --- spawns (frozen once the visitor is mostly scrolled away)
    if (scrollProgress < 0.3) {
      spawnT -= dt;
      if (spawnT <= 0) {
        spawnT = (state === 'attract' ? 2.2 : Math.max(0.55, 1.6 / diff));
        spawnEnemy();
      }
    }
    updateEnemies(dt);

    // --- collisions: player bullets vs enemies
    for (i = bullets.length - 1; i >= 0; i--) {
      var b = bullets[i], hit = false;
      for (var j = enemies.length - 1; j >= 0; j--) {
        var e = enemies[j];
        var dx = b.x - e.x, dy = b.y - e.y;
        if (dx * dx + dy * dy < (e.r + 2) * (e.r + 2)) {
          hit = true;
          e.hp--;
          boom(b.x, b.y, C.skyLite, 3);
          if (e.hp <= 0) {
            boom(e.x, e.y, e.t === 0 ? C.rose : e.t === 1 ? C.amber : C.lime, 14);
            if (state === 'playing') addScore(e.pts);
            sfx('hit');
            enemies.splice(j, 1);
          }
          break;
        }
      }
      if (hit) { bullets.splice(i, 1); continue; }

      // --- vs destructible page elements (playing only)
      if (state === 'playing') {
        for (j = 0; j < targets.length; j++) {
          var t = targets[j];
          if (t.alive && b.x >= t.x0 && b.x <= t.x1 && b.y >= t.y0 && b.y <= t.y1) {
            destroyTarget(t, b.x, b.y);
            bullets.splice(i, 1);
            break;
          }
        }
      }
    }
    respawnTargets(false);

    // --- collisions: ship
    if (state === 'playing') {
      ship.invuln -= dt;
      var hurt = false;
      for (j = enemies.length - 1; j >= 0; j--) {
        e = enemies[j];
        dx = ship.x - e.x; dy = ship.y - e.y;
        if (dx * dx + dy * dy < (e.r + 5) * (e.r + 5)) {
          boom(e.x, e.y, C.rose, 12);
          enemies.splice(j, 1);
          hurt = true;
        }
      }
      for (j = ebullets.length - 1; j >= 0; j--) {
        eb = ebullets[j];
        dx = ship.x - eb.x; dy = ship.y - eb.y;
        if (dx * dx + dy * dy < 49) { ebullets.splice(j, 1); hurt = true; }
      }
      if (hurt && ship.invuln <= 0) {
        ship.hp--;
        ship.invuln = 1.5;
        drawHP();
        boom(ship.x, ship.y, C.sky, 16);
        sfx('hurt');
        if (ship.hp <= 0) gameOver();
      }
    }

    updateParts(dt);
  }

  function updateParts(dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.92; p.vy *= 0.92;
      p.life -= dt;
      if (p.life <= 0) parts.splice(i, 1);
    }
  }

  // --------------------------------------------------------------- render --
  function render() {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, VW, VH);

    var i;
    for (i = 0; i < stars.length; i++) {
      ctx.fillStyle = stars[i].c;
      ctx.fillRect(stars[i].x | 0, stars[i].y | 0, 1, 1);
    }

    ctx.fillStyle = C.skyLite;
    for (i = 0; i < bullets.length; i++) ctx.fillRect((bullets[i].x - 1) | 0, bullets[i].y | 0, 2, 5);
    ctx.fillStyle = C.rose;
    for (i = 0; i < ebullets.length; i++) ctx.fillRect((ebullets[i].x - 2) | 0, (ebullets[i].y - 2) | 0, 4, 4);

    for (i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      var spr = e.t === 0 ? SPR.drone : e.t === 1 ? SPR.dart : SPR.tank;
      ctx.drawImage(spr, (e.x - spr.width / 2) | 0, (e.y - spr.height / 2) | 0);
    }

    if (!(state === 'playing' && ship.invuln > 0 && ((ship.invuln * 10) | 0) % 2)) {
      ctx.drawImage(SPR.ship, (ship.x - 6) | 0, (ship.y - 6) | 0);
      var fl = ((ship.flame * 12) | 0) % 2 ? SPR.flame0 : SPR.flame1;
      ctx.drawImage(fl, (ship.x - 2) | 0, (ship.y + 6) | 0);
    }

    for (i = 0; i < parts.length; i++) {
      ctx.fillStyle = parts[i].c;
      ctx.fillRect(parts[i].x | 0, parts[i].y | 0, 2, 2);
    }
  }

  // ----------------------------------------------------------- game flow --
  function resetRun() {
    bullets.length = 0; ebullets.length = 0; enemies.length = 0; parts.length = 0;
    score = 0; diff = 1; spawnT = 0.4;
    ship.hp = 3; ship.invuln = 0; ship.fire = 0;
    ship.x = VW / 2; ship.y = VH * 0.72;
    ui.score.textContent = 'SCORE 0';
    ui.best.textContent = 'BEST ' + best;
    drawHP();
    respawnTargets(true);
  }

  function startPlay() {
    resetRun();
    state = 'playing';
    autoScrolled = false;
    stage.dataset.state = 'playing';
    ui.startRow.hidden = true;
    ui.hud.hidden = false;
    ui.over.hidden = true;
    ui.pause.hidden = true;
    ui.hint.hidden = false;
    setTimeout(function () { ui.hint.hidden = true; }, 3200);
    if (coarse) lockTouch();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    cacheRects();
    sfx('start');
  }

  function gameOver() {
    state = 'gameover';
    stage.dataset.state = 'gameover';
    boom(ship.x, ship.y, C.amber, 26);
    sfx('over');
    unlockTouch();
    try { localStorage.setItem('dus-best', String(best)); } catch (e) {}
    ui.overScore.textContent = 'SCORE ' + score;
    ui.overBest.textContent = 'BEST ' + best;
    ui.over.hidden = false;
    // the flavor path: one gentle scroll toward the homepage, never repeated
    setTimeout(function () {
      if (!autoScrolled && state === 'gameover' && window.scrollY < stage.clientHeight * 0.4 && ui.content) {
        autoScrolled = true;
        ui.content.scrollIntoView({ behavior: 'smooth' });
      }
    }, 1600);
  }

  function toAttract() {
    state = 'attract';
    stage.dataset.state = 'attract';
    unlockTouch();
    ui.hud.hidden = true;
    ui.over.hidden = true;
    ui.pause.hidden = true;
    ui.hint.hidden = true;
    ui.startRow.hidden = false;
    respawnTargets(true);
    ship.hp = 3;
  }

  function exitToSite() {
    toAttract();
    if (ui.content) ui.content.scrollIntoView({ behavior: 'smooth' });
  }

  function pauseGame() {
    if (state !== 'playing') return;
    state = 'paused';
    ui.pause.hidden = false;
  }
  function resumeGame() {
    if (state !== 'paused') return;
    state = 'playing';
    ui.pause.hidden = true;
  }

  // -------------------------------------------------------- touch locking --
  var preventTouch = function (e) { e.preventDefault(); };
  function lockTouch() {
    stage.classList.add('locked');
    document.documentElement.classList.add('game-lock');
    stage.addEventListener('touchmove', preventTouch, { passive: false });
  }
  function unlockTouch() {
    stage.classList.remove('locked');
    document.documentElement.classList.remove('game-lock');
    stage.removeEventListener('touchmove', preventTouch, { passive: false });
  }

  // ---------------------------------------------------------------- input --
  var GAME_KEYS = { KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Space: 1 };

  addEventListener('keydown', function (e) {
    if (e.code === 'Escape' && (state === 'playing' || state === 'paused')) { toAttract(); return; }
    if (e.code === 'Enter' && state === 'attract' && running && !coarse) { startPlay(); return; }
    if (state === 'playing' && running && GAME_KEYS[e.code]) {
      keys[e.code] = true;
      e.preventDefault();   // arrows/space would otherwise scroll — only while playing
    }
  });
  addEventListener('keyup', function (e) { delete keys[e.code]; });
  addEventListener('blur', function () {
    keys = {};
    if (state === 'playing') pauseGame();
  });

  stage.addEventListener('pointermove', function (e) {
    if (coarse) return;
    var cr = canvas.getBoundingClientRect();
    if (!cr.width) return;
    var s = cr.width / canvas.width;
    pointer.x = (e.clientX - cr.left) / s;
    pointer.y = (e.clientY - cr.top) / s;
    pointer.active = true;
  });

  // mobile: relative one-finger drag (Sky Force convention), auto-fire does the rest
  stage.addEventListener('pointerdown', function (e) {
    if (!coarse || state !== 'playing') return;
    if (e.target.closest('a, button')) return;
    dragId = e.pointerId;
    pointer.x = e.clientX; pointer.y = e.clientY;
    clearTimeout(pauseTimer);
    try { stage.setPointerCapture(e.pointerId); } catch (err) {}
  });
  stage.addEventListener('pointermove', function (e) {
    if (!coarse || e.pointerId !== dragId || state !== 'playing') return;
    var cr = canvas.getBoundingClientRect();
    var s = cr.width ? cr.width / canvas.width : scale;
    dragX += (e.clientX - pointer.x) / s * 1.15;
    dragY += (e.clientY - pointer.y) / s * 1.15;
    pointer.x = e.clientX; pointer.y = e.clientY;
  });
  function endDrag(e) {
    if (!coarse || e.pointerId !== dragId) return;
    dragId = -1;
    // lifting the finger = natural pause moment (and an exit ramp)
    clearTimeout(pauseTimer);
    pauseTimer = setTimeout(function () {
      if (state === 'playing' && dragId === -1) pauseGame();
    }, 300);
  }
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  ui.startBtn.addEventListener('click', startPlay);
  ui.restart.addEventListener('click', startPlay);
  ui.resume.addEventListener('click', resumeGame);
  ui.exit.addEventListener('click', exitToSite);
  ui.continueBtn.addEventListener('click', exitToSite);
  ui.seeSite.addEventListener('click', exitToSite);
  ui.mute.addEventListener('click', function () { setMute(!muted); });

  // ------------------------------------------------- scroll-linked layer --
  // Reads native scroll; never intercepts it. Maps progress to the stage
  // transform with a plateau in the middle (the "pause halfway" the design
  // asks for), and freezes/parks the game as the visitor leaves.
  var scrollProgress = 0, trackSpan = 1, dirty = true;

  function measureTrack() {
    trackSpan = Math.max(1, track.offsetHeight - stage.offsetHeight);
    dirty = true;
  }

  function applyScroll() {
    var p = clamp(window.scrollY / trackSpan, 0, 1);
    if (!dirty && Math.abs(p - scrollProgress) < 0.001) return;
    scrollProgress = p; dirty = false;

    var H = stage.clientHeight, ty;
    if (p <= 0.4) ty = -(p / 0.4) * 0.5 * H;
    else if (p <= 0.6) ty = -0.5 * H;
    else ty = -0.5 * H - ((p - 0.6) / 0.4) * 0.45 * H;
    stage.style.transform = 'translateY(' + Math.round(ty) + 'px)';

    // dim + "keep going" label around the plateau
    var dim = 0;
    if (p > 0.25 && p < 0.75) dim = 1 - Math.abs(p - 0.5) / 0.25;
    ui.dim.style.opacity = dim.toFixed(2);

    scrollOK = p < 0.85;
    syncRunning();
  }

  addEventListener('scroll', function () {
    dirty = true;
    requestAnimationFrame(applyScroll);
  }, { passive: true });

  // ------------------------------------------------------ run/pause plumbing --
  function frame(t) {
    rafId = requestAnimationFrame(frame);
    var dt = t - last; last = t;
    if (dt > 100) dt = 100;
    acc += dt;
    while (acc >= STEP) { update(STEP / 1000); acc -= STEP; }
    render();
  }

  function syncRunning() {
    var want = ioVisible && !document.hidden && scrollOK;
    if (want === running) return;
    running = want;
    if (running) {
      last = performance.now(); acc = 0;
      rafId = requestAnimationFrame(frame);
    } else {
      cancelAnimationFrame(rafId);
      if (actx && actx.state === 'running') actx.suspend();
    }
  }

  new IntersectionObserver(function (entries) {
    ioVisible = entries[0].intersectionRatio > 0.25;
    syncRunning();
  }, { threshold: [0, 0.25, 0.5] }).observe(stage);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && state === 'playing') pauseGame();
    syncRunning();
  });

  var resizeT = 0;
  function queueResize() {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () { resize(); dirty = true; applyScroll(); }, 120);
  }
  addEventListener('resize', queueResize);
  if (window.ResizeObserver) new ResizeObserver(queueResize).observe(stage);

  // layout can shift once webfonts and the logo land — refresh target rects
  addEventListener('load', function () { resize(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(cacheRects);

  // ----------------------------------------------------------------- boot --
  track.classList.add('game-on');
  canvas.hidden = false;
  ui.startRow.hidden = false;
  ui.skip.hidden = false;
  ui.hud.hidden = true;
  ui.startBtn.textContent = coarse ? '▶ TAP TO PLAY' : '▶ PRESS START';
  ui.hint.textContent = coarse
    ? '드래그로 이동 · 발사는 자동 · EXIT ▼로 종료'
    : 'WASD/화살표 또는 마우스로 이동 · 발사는 자동 · ESC 종료';
  setMute(muted);
  ui.best.textContent = 'BEST ' + best;

  splitGlyphs();
  makePixelStars();
  resize();
  collectTargets();
  ship.x = VW / 2; ship.y = VH * 0.72;
  stage.dataset.state = 'attract';
  applyScroll();
  running = true;
  last = performance.now();
  rafId = requestAnimationFrame(frame);

  // tiny hook for testing/debugging
  window.__dusGame = {
    get state() { return state; },
    get score() { return score; },
    get running() { return running; },
    get progress() { return scrollProgress; },
    get ship() { return ship; },
    get counts() { return { bullets: bullets.length, ebullets: ebullets.length, enemies: enemies.length, parts: parts.length, targets: targets.length }; },
    start: startPlay, exit: exitToSite, resize: resize, cacheRects: cacheRects,
    applyScroll: function () { dirty = true; applyScroll(); },
    tick: function (n) { for (var i = 0; i < (n || 1); i++) update(STEP / 1000); render(); }
  };
})();
