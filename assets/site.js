(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  // ---- index: filter chips + search ----
  const rows = $$('#rows .row');
  if (rows.length) {
    let filter = 'all', q = '';
    const apply = () => {
      let shown = 0;
      rows.forEach(r => {
        const okF = filter === 'all' || r.dataset.kind === filter || r.dataset.cat === filter;
        const okQ = !q || q.split(/\s+/).every(w => r.dataset.text.includes(w));
        r.hidden = !(okF && okQ); if (!r.hidden) shown++;
      });
      $('#empty').hidden = shown > 0;
    };
    $$('.chip').forEach(c => c.addEventListener('click', () => {
      $$('.chip').forEach(x => x.setAttribute('aria-pressed', String(x === c)));
      filter = c.dataset.filter; apply();
    }));
    $('#q').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); apply(); });
    // list / grid view, remembered per visitor
    const list = $('#rows');
    const setView = v => { list.classList.toggle('grid', v === 'grid'); $$('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === v))); };
    try { const saved = localStorage.getItem('site:view'); if (saved) setView(saved); } catch (e) {}
    $$('[data-view]').forEach(b => b.addEventListener('click', () => { setView(b.dataset.view); try { localStorage.setItem('site:view', b.dataset.view); } catch (e) {} }));
  }

  // ---- optional reveal-on-scroll (Customize → Motion) ----
  if (document.body.classList.contains('reveal') && 'IntersectionObserver' in window) {
    const els = $$('.row, .shelf-item, .proj, .slide-wrap, .prose > *, .item-hero, .stage, .guide');
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
    els.forEach(el => { el.classList.add('reveal-item'); io.observe(el); });
  }

  // ---- decks: scale 1920x1080 slides to their frames ----
  const frames = $$('.slide-frame');
  if (frames.length && 'ResizeObserver' in window) {
    const ro = new ResizeObserver(es => es.forEach(e => e.target.style.setProperty('--s', e.contentRect.width / 1920)));
    frames.forEach(f => ro.observe(f));
  }
  const pres = $('#presenter');
  if (pres) {
    const slides = $$('.slide-wrap .slide');
    const stage = $('.presenter-stage', pres);
    let i = 0;
    const fit = () => { const s = Math.min(stage.clientWidth / 1920, stage.clientHeight / 1080); const el = stage.firstElementChild; if (el) el.style.setProperty('--s', s); };
    const show = n => {
      i = Math.max(0, Math.min(slides.length - 1, n));
      stage.innerHTML = ''; stage.appendChild(slides[i].cloneNode(true));
      $('#pcount').textContent = `${i + 1} / ${slides.length}`; fit();
    };
    const open = () => {
      const visible = $$('.slide-wrap').findIndex(w => w.getBoundingClientRect().bottom > 120);
      pres.hidden = false; show(visible < 0 ? 0 : visible);
      if (pres.requestFullscreen) pres.requestFullscreen().catch(() => {});
    };
    const close = () => { pres.hidden = true; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); const w = $$('.slide-wrap')[i]; if (w) w.scrollIntoView({ block: 'center' }); };
    $('#present').addEventListener('click', open);
    pres.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (b && b.dataset.go) show(i + Number(b.dataset.go));
      else if (b && b.hasAttribute('data-close')) close();
      else if (!b) show(i + (e.clientX > innerWidth / 2 ? 1 : -1));
    });
    addEventListener('keydown', e => {
      if (pres.hidden) return;
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); show(i + 1); }
      else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); show(i - 1); }
      else if (e.key === 'Home') show(0); else if (e.key === 'End') show(slides.length - 1);
      else if (e.key === 'Escape') close();
    });
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && !pres.hidden) close(); });
    addEventListener('resize', () => { if (!pres.hidden) fit(); });
  }

  // ---- writing: highlight the current section in the contents ----
  const toc = $$('.toc a');
  if (toc.length && 'IntersectionObserver' in window) {
    const map = new Map(toc.map(a => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { toc.forEach(a => a.classList.remove('on')); const a = map.get(e.target.id); if (a) a.classList.add('on'); }
    }), { rootMargin: '-15% 0px -75% 0px' });
    map.forEach((_, id) => { const h = document.getElementById(id); if (h) io.observe(h); });
  }
  // ---- home: a 3D stack of pieces; scrolling moves through it, not the page ----
  // The row runs diagonally between the catch phrase and the piece's text: the chosen piece sits nearest, below the
  // catch phrase, and the rest recede towards the far corner above the text. Its look (shape, surface, scene) comes
  // from #sh-look, written by the build from Manage -> Customize; Manage can also send a new look while you edit.
  const sh = $('.sh');
  if (sh && $('.world', sh)) (function () {
    const stage = $('.stack', sh), world = $('.world', sh);
    const cards = $$('.card', world);
    const N = cards.length; if (!N) return;
    const data = JSON.parse($('#sh-data').textContent);
    const ticks = $$('.sh-tick', sh);
    const now = $('.sh-now', sh);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lively = !document.body.classList.contains('no-tilt');
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const smooth = t => t * t * (3 - 2 * t);
    const RAD = Math.PI / 180;
    const T0 = performance.now();

    let start = 0; try { start = Number(sessionStorage.getItem('sh:i')) || 0; } catch (e) {}
    let target = clamp(Math.round(start), 0, N - 1), pos = target, vel = 0;
    // each card follows the stack with its own lag, so movement ripples through it; on load they fly in from the back
    const p = cards.map((_, i) => reduce ? target : i - 9 - (N - i) * 0.35);
    let hover = -1, shown = -1, G = null, avoid = [];
    const NEAR = 3;                                  // the chosen piece and this many after it always stay clear of the text
    const fade = cards.map(() => 1);                // cards further out fade where they would pass under the text
    const at = cards.map(() => ({}));               // where each card is this frame (for light and shadows)
    const given = cards.map(() => ({}));            // style values last written, so unchanged ones are not written again
    const put = (i, name, v) => { if (given[i][name] !== v) { given[i][name] = v; cards[i].style.setProperty(name, v); } };
    const shVals = {};
    const shPut = (name, v) => { if (shVals[name] !== v) { shVals[name] = v; sh.style.setProperty(name, v); } };

    // layers: backdrop behind everything, shadows and floor under the cards, an overlay between the cards and the text
    const bg = document.createElement('div'); bg.className = 'sh-bg'; bg.setAttribute('aria-hidden', 'true'); bg.innerHTML = '<i></i><i></i><i></i>';
    sh.insertBefore(bg, sh.firstChild);
    const fx = document.createElement('div'); fx.className = 'sh-fx'; fx.setAttribute('aria-hidden', 'true');
    stage.after(fx);
    const floorCv = document.createElement('canvas'); floorCv.className = 'sh-shadows'; floorCv.setAttribute('aria-hidden', 'true');
    stage.insertBefore(floorCv, world);

    // ---------- look ----------
    const LOOK = {};
    const SHAPES = ['book', 'folder', 'case', 'glass', 'record'];
    const SPEC = { matte: .25, paper: .18, linen: .16, leather: .45, ribbed: .3, bumps: .35, brushed: .85, gloss: 1 };   // how much each surface shines
    const TEXTURED = ['paper', 'linen', 'leather', 'ribbed', 'bumps', 'brushed'];
    const BACKDROPS = ['plain', 'glow', 'aurora', 'matrix', 'dust', 'grid', 'spotlight', 'crt'];
    const num = (v, a, b, d) => { v = Number(v); return v === v && v !== null && Number.isFinite(v) ? clamp(v, a, b) : d; };
    // Customize -> Grid; the same choices and defaults as resolveGrid() in scripts/theme.mjs
    function gridLook(g) {
      g = g || {};
      const pick = (v, list) => list.includes(v) ? v : list[0], flag = (v, d) => typeof v === 'boolean' ? v : d;
      return {
        pattern: pick(g.pattern, ['lines', 'lanes', 'dots', 'crosses']), cell: num(g.cell, 40, 400, 140), line: num(g.line, .5, 4, 1.2), major: Math.round(num(g.major, 0, 10, 0)),
        color: pick(g.color, ['accent', 'text', 'piece', 'custom']), hex: /^#[0-9a-f]{6}$/i.test(g.hex) ? g.hex : '#39ff88',
        align: pick(g.align, ['camera', 'row', 'slope', 'angle']), angle: num(g.angle, -45, 45, 0),
        surfaces: pick(g.surfaces, ['floor', 'both', 'tunnel', 'room']), reach: num(g.reach, 0, 100, 50), lift: num(g.lift, -100, 300, 0),
        motion: pick(g.motion, ['row', 'flow', 'waves', 'still']), speed: num(g.speed, 0, 100, 40),
        pulse: flag(g.pulse, true), scan: flag(g.scan, false), pool: flag(g.pool, true), glow: flag(g.glow, false),
        horizon: pick(g.horizon, ['glow', 'sun', 'none']), reflect: flag(g.reflect, false)
      };
    }
    function applyLook(lk, refit) {
      const c = (lk && lk.covers) || {}, s = (lk && lk.scene) || {};
      Object.assign(LOOK, {
        shape: SHAPES.includes(c.shape) ? c.shape : 'book', depth: num(c.depth, .3, 3, 1), round: num(c.round, 0, 24, 3),
        material: c.material in SPEC ? c.material : 'matte', relief: num(c.relief, 0, 100, 50), sheen: num(c.sheen, 0, 100, 40),
        backdrop: BACKDROPS.includes(s.backdrop) ? s.backdrop : 'plain', intensity: num(s.intensity, 0, 100, 60),
        shadows: s.shadows === undefined ? true : !!s.shadows, light: num(s.light, 0, 360, 315), sdepth: num(s.depth, 0, 100, 50),
        tilt: num(s.tilt, -20, 20, 0), focus: num(s.focus, 0, 100, 50), highlight: ['glow', 'outline', 'none'].includes(s.highlight) ? s.highlight : 'glow', soft: !!s.soft,
        grid: gridLook(s.grid)
      });
      const b = document.body;
      b.className = b.className.split(/\s+/).filter(n => n && !/^(shape|mat|bd|hl)-/.test(n) && n !== 'has-tex' && n !== 'soft').join(' ');
      b.classList.add('shape-' + LOOK.shape, 'mat-' + LOOK.material, 'bd-' + LOOK.backdrop, 'hl-' + LOOK.highlight);
      if (LOOK.soft) b.classList.add('soft');
      shPut('--depth', String(LOOK.depth)); shPut('--rd', String(LOOK.round));
      shPut('--relief', (LOOK.relief / 100).toFixed(2)); shPut('--bi', (LOOK.intensity / 100).toFixed(2));
      if (TEXTURED.includes(LOOK.material)) {
        const m = textures(LOOK.material);
        b.classList.add('has-tex');
        shPut('--tex-g', `url("${m.g}")`); shPut('--tex-x', `url("${m.x}")`); shPut('--tex-y', `url("${m.y}")`); shPut('--tile', m.tile + 'px');
      }
      backdrop(LOOK.backdrop);
      if (refit) measure();
    }

    // Surface maps, made once per material: grain (overlaid as is) and the slope across and down, which the light
    // brightens or darkens per card as it turns (see shade()). Small and tileable, so they cost little.
    const TEX = {};
    function textures(mat) {
      if (TEX[mat]) return TEX[mat];
      const S = 128;
      let seed = 0x2f6b1d ^ (mat.charCodeAt(0) * 7919);
      const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const noise = (cx, cy) => {   // value noise that wraps around the tile
        const g = Array.from({ length: cx * cy }, rnd), v = (a, b) => g[(((b % cy) + cy) % cy) * cx + (((a % cx) + cx) % cx)];
        return (x, y) => { const fx = x / S * cx, fy = y / S * cy, ix = Math.floor(fx), iy = Math.floor(fy), tx = smooth(fx - ix), ty = smooth(fy - iy);
          const a = v(ix, iy) + (v(ix + 1, iy) - v(ix, iy)) * tx, b = v(ix, iy + 1) + (v(ix + 1, iy + 1) - v(ix, iy + 1)) * tx; return a + (b - a) * ty; };
      };
      let f, tile = 64;
      if (mat === 'paper') { const a = noise(16, 16), b = noise(48, 48), c = noise(6, 64); f = (x, y) => a(x, y) * .3 + b(x, y) * .45 + c(x, y) * .35; tile = 150; }
      else if (mat === 'linen') {   // plain weave: in each cell the thread on top runs across or down
        const n = noise(32, 32), slub = noise(4, 64);
        f = (x, y) => { const i = Math.floor(x / 8), j = Math.floor(y / 8), u = (x % 8) / 8, v = (y % 8) / 8;
          const t = (i + j) & 1 ? Math.sin(Math.PI * v) * (.8 + .2 * Math.sin(Math.PI * u)) : Math.sin(Math.PI * u) * (.8 + .2 * Math.sin(Math.PI * v));
          return .45 + .45 * t + .1 * n(x, y) + .1 * slub(x, y); };
        tile = 52;
      } else if (mat === 'leather') {   // pebbles with grooves between them
        const C = 9, cell = S / C, pts = [], n = noise(32, 32);
        for (let j = 0; j < C; j++) for (let i = 0; i < C; i++) pts.push([(i + .15 + rnd() * .7) * cell, (j + .15 + rnd() * .7) * cell]);
        f = (x, y) => { let d1 = 1e9, d2 = 1e9; const ci = Math.floor(x / cell), cj = Math.floor(y / cell);
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            const ii = (ci + di + C) % C, jj = (cj + dj + C) % C, q = pts[jj * C + ii];
            const d = Math.hypot(x - (q[0] + (ci + di - ii) * cell), y - (q[1] + (cj + dj - jj) * cell));
            if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
          }
          return Math.sqrt(clamp((d2 - d1) / (cell * .35), 0, 1)) * .8 + n(x, y) * .2; };
        tile = 120;
      } else if (mat === 'ribbed') { const n = noise(16, 64); f = (x, y) => .5 + .5 * Math.cos(2 * Math.PI * x / (S / 14)) + n(x, y) * .12; tile = 84; }
      else if (mat === 'bumps') { const cell = S / 8; f = (x, y) => { const d = Math.hypot((x % cell) - cell / 2, (y % cell) - cell / 2), r = cell * .32; return d < r ? Math.sqrt(1 - (d / r) ** 2) : 0; }; tile = 96; }
      else { const a = noise(2, 128), b = noise(6, 128), c = noise(32, 32); f = (x, y) => a(x, y) * .55 + b(x, y) * .35 + c(x, y) * .1; tile = 220; }   // brushed
      const h = new Float32Array(S * S);
      let lo = Infinity, hi = -Infinity;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const v = f(x + .5, y + .5); h[y * S + x] = v; if (v < lo) lo = v; if (v > hi) hi = v; }
      const H = (x, y) => (h[((y + S) % S) * S + ((x + S) % S)] - lo) / (hi - lo || 1);
      const gx = new Float32Array(S * S), gy = new Float32Array(S * S);
      let gm = 1e-6;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const n = y * S + x; gx[n] = H(x + 1, y) - H(x - 1, y); gy[n] = H(x, y + 1) - H(x, y - 1); gm = Math.max(gm, Math.abs(gx[n]), Math.abs(gy[n])); }
      gm *= .7;
      const cv = document.createElement('canvas'); cv.width = cv.height = S;
      const ctx = cv.getContext('2d');
      const img = val => { const d = ctx.createImageData(S, S); for (let n = 0; n < S * S; n++) { const g = clamp(Math.round(val(n)), 0, 255); d.data[n * 4] = d.data[n * 4 + 1] = d.data[n * 4 + 2] = g; d.data[n * 4 + 3] = 255; } ctx.putImageData(d, 0, 0); return cv.toDataURL(); };
      return (TEX[mat] = {
        tile,
        g: img(n => 128 + (H(n % S, (n / S) | 0) - .5) * 150),
        x: img(n => 128 + clamp(gx[n] / gm, -1, 1) * 118),
        y: img(n => 128 + clamp(gy[n] / gm, -1, 1) * 118)
      });
    }

    // ---------- animated backdrops drawn on a canvas (the others are CSS, in site.css) ----------
    let anim = null;
    const cssVar = n => getComputedStyle(document.body).getPropertyValue(n).trim();
    function canvasLayer() {
      const c = document.createElement('canvas'); bg.appendChild(c);
      const L = { c, ctx: c.getContext('2d'), dpr: Math.min(1.5, devicePixelRatio || 1) };
      L.size = () => { c.width = Math.max(1, Math.round(bg.clientWidth * L.dpr)); c.height = Math.max(1, Math.round(bg.clientHeight * L.dpr)); };
      L.size();
      return L;
    }
    function matrixRain() {   // falling characters; they fall faster while the stack moves
      const L = canvasLayer(), { c, ctx } = L;
      const glyphs = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン0123456789ABCDEF<>/[]{}=+*'.split('');
      let cols = [], fs = 15, acc = 0, back, hi, fg;
      const setup = () => {
        L.size(); fs = Math.round(15 * L.dpr);
        cols = Array.from({ length: Math.ceil(c.width / fs) }, () => ({ y: -Math.random() * c.height / fs, sp: .5 + Math.random() * .7, run: 0, last: '' }));
        back = cssVar('--bg') || '#000'; hi = cssVar('--hi') || '#3f8'; fg = cssVar('--fg') || '#fff';
        ctx.fillStyle = back; ctx.fillRect(0, 0, c.width, c.height);
      };
      setup();
      return { kind: 'matrix', resize: setup, stop: () => c.remove(), step(dt) {
        acc += dt * (1 + Math.min(Math.abs(vel) * 40, 4)); if (acc < 1 / 24) return; acc = 0;
        ctx.globalAlpha = .12; ctx.fillStyle = back; ctx.fillRect(0, 0, c.width, c.height); ctx.globalAlpha = 1;
        ctx.font = `${fs}px ${cssVar('--mono') || 'monospace'}`; ctx.textBaseline = 'top';
        cols.forEach((col, i) => {
          col.run += col.sp; if (col.run < 1) return; col.run -= 1;
          const ch = glyphs[(Math.random() * glyphs.length) | 0];
          if (col.last) { ctx.fillStyle = hi; ctx.fillText(col.last, i * fs, (col.y - 1) * fs); }
          ctx.fillStyle = fg; ctx.fillText(ch, i * fs, col.y * fs); col.last = ch;
          col.y += 1; if (col.y * fs > c.height && Math.random() > .97) { col.y = 0; col.last = ''; }
        });
      } };
    }
    function dust() {   // motes and a few soft lights; they drift with the stack
      const L = canvasLayer(), { c, ctx } = L;
      let motes = [], fg, hi, t = 0;
      const setup = () => {
        L.size(); fg = cssVar('--fg') || '#fff'; hi = cssVar('--hi') || '#f60';
        const n = Math.round(clamp(c.width * c.height / 9000 / L.dpr / L.dpr, 40, 160));
        motes = Array.from({ length: n }, () => ({ x: Math.random(), y: Math.random(), z: Math.random(), big: Math.random() > .93, s: .3 + Math.random() * .7, ph: Math.random() * 6.28 }));
      };
      setup();
      return { kind: 'dust', resize: setup, stop: () => c.remove(), step(dt) {
        t += dt; ctx.clearRect(0, 0, c.width, c.height);
        for (const q of motes) {
          q.y -= dt * .012 * (.4 + q.z); q.x += -vel * .25 * (.3 + q.z) * Math.min(dt * 60, 3) / 60 + Math.sin(t * .3 + q.ph) * dt * .003;
          const px = ((((q.x - pos * .012 * (.2 + q.z)) % 1) + 1) % 1) * c.width, py = (((q.y % 1) + 1) % 1) * c.height;
          const rad = (q.big ? 10 + q.z * 22 : .6 + q.z * 1.6) * L.dpr;
          ctx.globalAlpha = (q.big ? .08 + q.z * .07 : .25 + q.z * .45) * (.6 + .4 * Math.sin(t * q.s + q.ph));
          if (q.big) { const g = ctx.createRadialGradient(px, py, 0, px, py, rad); g.addColorStop(0, hi); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; } else ctx.fillStyle = fg;
          ctx.beginPath(); ctx.arc(px, py, rad, 0, 6.2832); ctx.fill();
        }
        ctx.globalAlpha = 1;
      } };
    }
    function backdrop(kind) {
      if (anim && anim.kind === kind) return;
      if (anim) { anim.stop(); anim = null; }
      if (kind === 'matrix') anim = matrixRain();
      else if (kind === 'dust') anim = dust();
      if (anim && reduce) for (let n = 0; n < 160; n++) anim.step(.05);   // a still frame
    }

    // ---------- geometry ----------
    // Everything is placed on screen first and then pushed back in depth, so the row lands exactly on the line
    // between the texts. The row is a straight line in 3D that meets the horizon at VP; each card faces back
    // along it, which sets the camera angle (rx, ry) by itself.
    function config(k, narrow, mir, W, O, P, A, Rp) {
      sh.style.setProperty('--k', k.toFixed(3));
      const far = Math.max(1, Math.min(N - 1, narrow ? 7 : 9));             // the piece that lands at the far end
      const m = 1.6 + (1 - LOOK.sdepth / 100) * 3.4;                         // where the row's lines meet, in row lengths: nearer = deeper
      const VP = [A[0] + (Rp[0] - A[0]) * m, A[1] + (Rp[1] - A[1]) * m];
      const reach = P / (m - 1);                                             // depth at which the row reaches its far end
      const sep = 1.4 + LOOK.focus / 100 * 2.2;                              // the gap around the chosen piece, in resting steps
      const step = Math.min(reach / (sep + far - 1), 420 * k);
      const D = [(VP[0] - O[0]) / P, (VP[1] - O[1]) / P];                    // the row's direction per unit of depth
      const rx = clamp(Math.atan(D[1]) / RAD - 6, -42, -8);
      const ry = clamp(Math.atan(-D[0] * Math.cos(rx * RAD)) / RAD, -66, -14);
      G = { k, narrow, mir, W, O, P, A, VP, D, rx, ry, step, gap: step * sep, back: step * 1.2,
        lift: 26 * k, pull: (narrow ? 240 : 190) * k, turn: 16, cw: cards[0].offsetWidth, ch: cards[0].offsetHeight };
      G.floorY = A[1] + G.ch * .62 + 40 * k;
      // where the backdrops centre their light
      const ax = mir ? W - A[0] : A[0];
      shPut('--ax', ax.toFixed(0) + 'px'); shPut('--ay', (A[1] - G.lift).toFixed(0) + 'px');
      shPut('--hz', O[1].toFixed(0) + 'px'); shPut('--cwp', G.cw.toFixed(0) + 'px');
      const la = LOOK.light * RAD;
      shPut('--lsx', (50 + Math.sin(la) * 60).toFixed(0) + '%'); shPut('--lsy', (50 - Math.cos(la) * 60).toFixed(0) + '%');
    }

    // Where the chosen piece and the next few sit, on screen, when the stack rests on piece t.
    function restRects(t) {
      const keep = p.slice(), keepHover = hover, keepVel = vel;
      hover = -1; vel = 0;
      for (let i = 0; i < N; i++) { p[i] = t; place(i, 0); }
      const rects = cards.filter((_, i) => i - t >= 0 && i - t <= NEAR).map(c => $('.cf-front', c).getBoundingClientRect());
      for (let i = 0; i < N; i++) p[i] = keep[i];
      hover = keepHover; vel = keepVel;
      return rects;
    }

    // Lay the row along the diagonal between the two text blocks, then size it so that, wherever it rests,
    // the chosen piece and the next ones stay clear of the actual lines of text.
    function measure() {
      const R = sh.getBoundingClientRect(), W = R.width, H = R.height, narrow = W < 720;
      const pad = 14;
      const grow = (r, top) => ({ left: r.left - pad, right: r.right + pad, top: r.top - pad - top, bottom: r.bottom + pad });
      const lines = el => { const r = document.createRange(); r.selectNodeContents(el); return [...r.getClientRects()].filter(b => b.width > 2 && b.height > 2); };
      const catchLines = lines($('.sh-catch', sh)), infoLines = [...now.children].flatMap(el => lines(el)), infoBox = $('.sh-info', sh).getBoundingClientRect();
      avoid = [...catchLines.map(b => grow(b, 0)), ...infoLines.map(b => grow(b, 0)), grow(infoBox, 30)].filter(r => r.right - r.left > 0);
      const box = rs => rs.length ? rs.reduce((u, b) => ({ left: Math.min(u.left, b.left - R.left), right: Math.max(u.right, b.right - R.left), top: Math.min(u.top, b.top - R.top), bottom: Math.max(u.bottom, b.bottom - R.top) }), { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity }) : null;
      const C0 = box(catchLines), I0 = box([...infoLines, infoBox].filter(b => b.width > 0));
      // mirrored when the catch phrase sits to the right of the piece's text
      const mir = !!(C0 && I0 && C0.left + C0.right > I0.left + I0.right + 40);
      const mb = b => b && (mir ? { left: W - b.right, right: W - b.left, top: b.top, bottom: b.bottom } : b);
      const C = mb(C0), I = mb(I0);
      // the free height in a column of the stage: below the text above it, above the text below it
      const span = (x0, x1) => { let top = 0, bot = H; for (const b of [C, I]) if (b && b.left < x1 && b.right > x0) { if ((b.top + b.bottom) / 2 < H / 2) top = Math.max(top, b.bottom); else bot = Math.min(bot, b.top); } return bot - top < 60 ? [0, H] : [top, bot]; };
      const [lt, lb] = span(0, W * .38), [rt, rb] = span(W * .62, W);
      const Lp = [W * .07, lt + (lb - lt) * (narrow ? .6 : .56)];
      let Rp = [W * (narrow ? .9 : .88), rt + (rb - rt) * (narrow ? .4 : .4)];
      if (LOOK.tilt) { const a = -LOOK.tilt * RAD, dx = Rp[0] - Lp[0], dy = Rp[1] - Lp[1]; Rp = [Lp[0] + dx * Math.cos(a) - dy * Math.sin(a), Lp[1] + dx * Math.sin(a) + dy * Math.cos(a)]; }
      const O = [W / 2, H * .45], P = clamp(Math.hypot(W, H) * 1.25, 1300, 3600);
      stage.style.perspective = P.toFixed(0) + 'px'; stage.style.perspectiveOrigin = `${O[0].toFixed(0)}px ${O[1].toFixed(0)}px`;
      const len = Math.hypot(Rp[0] - Lp[0], Rp[1] - Lp[1]) || 1, u = [(Rp[0] - Lp[0]) / len, (Rp[1] - Lp[1]) / len];
      const along = f => [Lp[0] + u[0] * len * f, Lp[1] + u[1] * len * f];
      const hits = rects => rects.some(r => avoid.some(a => r.left < a.right && r.right > a.left && r.top < a.bottom && r.bottom > a.top));
      const checks = [...new Set([0, N - 1, Math.round(target)])];
      const spots = [.2, .26, .14, .32, .1, .38, .44, .5];                    // where along the row the chosen piece may sit
      let k = clamp(narrow ? Math.min(W / 640, H / 900) : Math.min(W / 1500, H / 800), .45, 1.3), done = false;
      while (!done) {
        for (const f of spots) {
          config(k, narrow, mir, W, O, P, along(f), Rp);
          if (!checks.some(t => hits(restRects(t)))) { done = true; break; }
        }
        if (!done) { if (k <= .3) { config(k, narrow, mir, W, O, P, along(spots[0]), Rp); done = true; } else k *= .93; }
      }
      const r = stage.getBoundingClientRect(); fdpr = Math.min(1.25, devicePixelRatio || 1);
      floorCv.width = Math.max(1, Math.round(r.width * fdpr)); floorCv.height = Math.max(1, Math.round(r.height * fdpr));
      hiColor = cssVar('--hi') || '#3f8'; fgColor = cssVar('--fg') || '#fff';
      if (anim) anim.resize();
    }
    let fdpr = 1, hiColor = '#3f8', fgColor = '#fff';

    function place(i, time) {
      const d = i - p[i], ad = Math.abs(d);
      const a = Math.max(0, 1 - ad);                         // 1 for the chosen piece
      const hv = i === hover && ad > .5 && lively ? 1 : 0;
      // depth along the row: pieces ahead recede, passed ones come forward and fade out
      const t = d >= 0 ? G.gap * smooth(Math.min(d, 1)) + G.step * Math.max(d - 1, 0) : -G.back * smooth(Math.min(ad, 1)) - G.step * .5 * Math.max(ad - 1, 0);
      const f = t / (G.P + t);                               // how far towards VP that is, on screen
      const bob = reduce ? 0 : Math.sin(time * 1.25 + i * .7) * 5 * G.k * (.35 + a);
      let sx = G.A[0] + (G.VP[0] - G.A[0]) * f;
      const sy = G.A[1] + (G.VP[1] - G.A[1]) * f - a * G.lift - hv * 18 * G.k + bob;
      const z = -t + a * G.pull + hv * 30 * G.k;             // the chosen piece comes towards you, out of the row
      if (G.mir) sx = G.W - sx;
      const q = (G.P - z) / G.P;                             // keep it on its screen spot at that depth
      const x = G.O[0] + (sx - G.O[0]) * q, y = G.O[1] + (sy - G.O[1]) * q;
      const flip = reduce ? 0 : clamp(-vel * 200, -28, 28) * (1 - a * .7) * Math.min(1, ad * 1.5 + .3);
      const yaw = (G.mir ? -1 : 1) * (G.ry + a * G.turn + flip);
      const sc = 1 + a * .08 + hv * .03;
      const c = cards[i];
      c.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,${z.toFixed(1)}px) rotateX(${G.rx.toFixed(2)}deg) rotateY(${yaw.toFixed(2)}deg) scale(${sc.toFixed(3)})`;
      const vis = (d >= 0 ? clamp(1 - (ad - 9) / 4, 0, 1) : clamp(1 - ad * .7, 0, 1)) * fade[i];
      c.style.opacity = vis.toFixed(2);
      c.style.visibility = vis > .01 ? '' : 'hidden';
      Object.assign(at[i], { x, y, z, yaw, sc, o: vis, ad, yb: G.O[1] + (sy - bob - G.O[1]) * q });   // yb: without the bob, for shadows
    }

    // the scene's light, pointing at it: for the surfaces (any direction) and for shadows (always from above)
    function lights() {
      const a = LOOK.light * RAD, hx = Math.sin(a), hy = -Math.cos(a);
      const n = v => { const l = Math.hypot(v[0], v[1], v[2]); return v.map(c => c / l); };
      return { tex: n([hx * .9, hy * .9, .7]), drop: n([hx * .8, Math.min(hy, -.3) * .9 - .5, .7]) };
    }
    // the other pieces step back; each surface is lit for the way it faces now
    function shade(i, Lt) {
      const S = at[i];
      put(i, '--dim', (LOOK.focus / 100 * .72 * smooth(Math.min(S.ad, 1)) * (.7 + .3 * Math.min(S.ad / 5, 1))).toFixed(2));
      if (LOOK.soft && !G.narrow) put(i, '--bl', clamp((S.ad - .6) * .7, 0, 2.4).toFixed(1) + 'px');
      const r = G.rx * RAD, b = S.yaw * RAD, cr = Math.cos(r), sr = Math.sin(r), cb = Math.cos(b), sb = Math.sin(b);
      const local = v => { const y1 = v[1] * cr + v[2] * sr, z1 = -v[1] * sr + v[2] * cr; return [v[0] * cb - z1 * sb, y1, v[0] * sb + z1 * cb]; };
      const l = local(Lt);
      put(i, '--lxa', Math.abs(l[0]).toFixed(2)); put(i, '--lxi', l[0] > 0 ? '1' : '0');
      put(i, '--lya', Math.abs(l[1]).toFixed(2)); put(i, '--lyi', l[1] > 0 ? '1' : '0');
      // the glint sits halfway between the light and the eye
      const ex = G.O[0] - S.x, ey = G.O[1] - S.y, ez = G.P - S.z, en = Math.hypot(ex, ey, ez) || 1;
      const v = local([ex / en, ey / en, ez / en]), h = [l[0] + v[0], l[1] + v[1], l[2] + v[2]], hn = Math.hypot(h[0], h[1], h[2]) || 1;
      put(i, '--gx', clamp(50 + h[0] / hn * 120, -15, 115).toFixed(0) + '%'); put(i, '--gy', clamp(50 + h[1] / hn * 120, -15, 115).toFixed(0) + '%');
      put(i, '--gs', (SPEC[LOOK.material] * LOOK.sheen / 100 * (.5 + .5 * Math.pow(Math.max(0, h[2] / hn), 2))).toFixed(2));
    }

    // ---------- the floor: grid, horizon, reflections, light pool and shadows, all on one canvas behind the cards ----------
    // The floor is a plane given by a point o, two directions in it (e1 across, e2 towards you) and nd, pointing down
    // out of it. Customize -> Grid turns it (along the row, any angle) or tilts it so the pieces stand on it.
    let floorKey = '', pulseAt = -10, colorAt = -10, gridCol = '#3f8';
    const clock = () => (performance.now() - T0) / 1000;
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const unit = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    const along = (o, d, s) => [o[0] + d[0] * s, o[1] + d[1] * s, o[2] + d[2] * s];
    const proj = X => { const w = G.P / (G.P - X[2]); return [G.O[0] + (X[0] - G.O[0]) * w, G.O[1] + (X[1] - G.O[1]) * w, w]; };
    function floorFrame() {
      const gr = LOOK.grid, grid = LOOK.backdrop === 'grid', k = G.k;
      const Dxa = (G.mir ? -1 : 1) * G.D[0], ax = G.mir ? G.W - G.A[0] : G.A[0], lift = grid ? gr.lift * k : 0;
      if (grid && gr.align === 'slope') {   // the floor follows the row, so every piece stands on it
        const e2 = unit([-Dxa, -G.D[1], 1]), e1 = unit([1, 0, Dxa]);
        let nd = unit([e2[1] * e1[2] - e2[2] * e1[1], e2[2] * e1[0] - e2[0] * e1[2], e2[0] * e1[1] - e2[1] * e1[0]]);
        if (nd[1] < 0) nd = nd.map(v => -v);
        return { o: [ax, G.A[1] + G.ch * .55 + 6 * k + lift, 0], e1, e2, nd, H: G.ch * 2.6 };
      }
      const th = !grid ? 0 : gr.align === 'row' ? Math.atan(Dxa) : gr.align === 'angle' ? gr.angle * RAD : 0;
      const fy = G.floorY + lift;
      return { o: [ax, fy, 0], e1: [Math.cos(th), 0, Math.sin(th)], e2: [-Math.sin(th), 0, Math.cos(th)], nd: [0, 1, 0], H: Math.max(2 * (fy - G.O[1]), G.ch * 2.4) };
    }
    // the four corners of a card as it stands now (without the bob), in view space
    function corners(S) {
      const r = G.rx * RAD, cr = Math.cos(r), sr = Math.sin(r), b = S.yaw * RAD, cb = Math.cos(b), sb = Math.sin(b), hw = G.cw / 2, hh = G.ch / 2;
      return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([cx, cy]) => {
        const lx = cx * S.sc, ly = cy * S.sc, x1 = lx * cb, z1 = -lx * sb;
        return [S.x + x1, S.yb + ly * cr - z1 * sr, S.z + ly * sr + z1 * cr];
      });
    }
    const gridI = () => Math.min(1, LOOK.intensity / 100 * 1.4);

    function drawFloor(Ls, time) {
      const gr = LOOK.grid, grid = LOOK.backdrop === 'grid';
      // animated grids redraw every frame; otherwise only when something on the floor moved (the bob does not count)
      const live = grid && !reduce && (gr.motion === 'flow' || gr.motion === 'waves' || gr.scan || (gr.pulse && time - pulseAt < 2.8) || (gr.color === 'piece' && time - colorAt < 1.3));
      const key = [LOOK.backdrop, LOOK.shadows, LOOK.light, LOOK.intensity, JSON.stringify(gr), floorCv.width, floorCv.height, pos.toFixed(3), ...at.map(S => `${S.x | 0},${S.yb | 0},${S.z | 0},${(S.yaw * 4) | 0},${(S.o * 50) | 0}`)].join('|');
      if (!live && key === floorKey) return;
      floorKey = live ? '' : key;
      const ctx = floorCv.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, floorCv.width, floorCv.height);
      ctx.setTransform(fdpr, 0, 0, fdpr, 0, 0);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      const F = floorFrame();
      if (grid) {
        gridCol = gr.color === 'text' ? fgColor : gr.color === 'custom' ? gr.hex : gr.color === 'piece' ? (getComputedStyle(sh).getPropertyValue('--env-a').trim() || hiColor) : hiColor;
        horizon(ctx, F, gr);
        if (gr.reflect) reflections(ctx, F);
        drawGrid(ctx, F, gr, time);
        if (gr.pool) pool(ctx, F);
      }
      if (LOOK.shadows && !document.body.classList.contains('flat-objects')) shadows(ctx, F, Ls);
    }

    function drawGrid(ctx, F, gr, time) {
      const { P } = G, k = G.k, cell = gr.cell * k, I = gridI(), t = reduce ? 0 : time;
      const zNear = P * .45, zFar = -P * (.8 + gr.reach / 100 * 3.6);
      const Wc = floorCv.width / fdpr, Hc = floorCv.height / fdpr;
      // how far the floor has moved: with the row, and on its own when it flows
      const Dxa = (G.mir ? -1 : 1) * G.D[0];
      const mv = gr.motion === 'still' ? [0, 0, 0] : [-Dxa * pos * G.step, 0, pos * G.step];
      if (gr.motion === 'flow') mv[2] += t * gr.speed * 6 * k;
      const fade = z => { const a = clamp((z - zFar) / (zNear * .5 - zFar), 0, 1), b = clamp((zNear - z) / (P * .3), 0, 1); return a * a * b; };
      // ripple from the chosen piece, and a light sweeping away from you
      const pr = (time - pulseAt) * 1500 * k, pmax = 3600 * k, pulseOn = gr.pulse && !reduce && pr >= 0 && pr < pmax;
      const scanZ = zNear - ((t * (150 + gr.speed * 8) * k) % (zNear - zFar)), scanOn = gr.scan && !reduce;
      const boost = (a, b, z) => {
        let v = 0;
        if (pulseOn) { const d = Math.hypot(a, b) - pr; v += Math.exp(-(d * d) / (2 * (80 * k) ** 2)) * (1 - pr / pmax) * 2.4; }
        if (scanOn) { const d = z - scanZ; v += Math.exp(-(d * d) / (2 * (120 * k) ** 2)) * 1.8; }
        return v;
      };
      const waves = gr.motion === 'waves';
      const wave = (a, b) => 90 * k * Math.sin(a / (260 * k) + t * 1.1) * Math.sin(b / (330 * k) + t * .8) * clamp((Math.hypot(a, b) - 420 * k) / (1200 * k), 0, 1);
      const up = F.nd.map(v => -v);
      const reachX = (G.W * .5 + Math.abs(F.o[0] - G.O[0])) * (1 - zFar / P) + cell;
      const R = Math.max(reachX, zNear - zFar) * 1.1;
      const planes = [{ o: F.o, A: F.e1, B: F.e2, a0: -R, a1: R, b0: -R, b1: R, floor: true, alpha: 1 }];
      if (gr.surfaces === 'both' || gr.surfaces === 'tunnel') planes.push({ o: along(F.o, up, F.H), A: F.e1, B: F.e2, a0: -R, a1: R, b0: -R, b1: R, alpha: .8 });
      if (gr.surfaces === 'tunnel') {
        const c = (G.O[0] - F.o[0]) / (F.e1[0] || 1), wx = G.W * .62;
        for (const s of [-1, 1]) planes.push({ o: along(F.o, F.e1, c + s * wx), A: up, B: F.e2, a0: 0, a1: F.H, b0: -R, b1: R, alpha: .7 });
      }
      if (gr.surfaces === 'room') {
        const back = (zFar * .7 - F.o[2]) / (F.e2[2] || 1);
        planes.push({ o: along(F.o, F.e2, back), A: F.e1, B: up, a0: -R, a1: R, b0: 0, b1: F.H * 1.6, alpha: .7, flatFade: .5 });
      }
      ctx.lineCap = 'round'; ctx.strokeStyle = gridCol; ctx.fillStyle = gridCol;
      const pt = (pl, a, b) => { let X = [pl.o[0] + pl.A[0] * a + pl.B[0] * b, pl.o[1] + pl.A[1] * a + pl.B[1] * b, pl.o[2] + pl.A[2] * a + pl.B[2] * b]; if (waves && pl.floor) X = along(X, up, wave(a, b)); return X; };
      const zOf = (pl, a, b) => pl.o[2] + pl.A[2] * a + pl.B[2] * b;
      const out = (p, q) => (p[0] < -40 && q[0] < -40) || (p[0] > Wc + 40 && q[0] > Wc + 40) || (p[1] < -40 && q[1] < -40) || (p[1] > Hc + 40 && q[1] > Hc + 40);
      const stroke = (p, q, alpha, width) => {
        if (alpha < .01 || out(p, q)) return;
        if (gr.glow) { ctx.globalAlpha = Math.min(1, alpha * .22); ctx.lineWidth = width * 5; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); }
        ctx.globalAlpha = Math.min(1, alpha); ctx.lineWidth = width;
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      };
      // one line of the grid, from (a0,b0) to (a1,b1) in the plane: clipped to the visible depth, in short pieces so it can fade
      const line = (pl, a0, b0, a1, b1, major) => {
        const z0 = zOf(pl, a0, b0), z1 = zOf(pl, a1, b1);
        let t0 = 0, t1 = 1;
        if (Math.abs(z1 - z0) < 1e-6) { if (z0 > zNear || z0 < zFar) return; }
        else {
          const ta = (zNear - z0) / (z1 - z0), tb = (zFar - z0) / (z1 - z0);
          t0 = Math.max(0, Math.min(ta, tb)); t1 = Math.min(1, Math.max(ta, tb));
          if (t1 <= t0) return;
        }
        const n = waves && pl.floor ? 18 : 7;
        let prev = null;
        for (let s = 0; s <= n; s++) {
          const u = t0 + (t1 - t0) * s / n, a = a0 + (a1 - a0) * u, b = b0 + (b1 - b0) * u;
          const X = pt(pl, a, b), p = proj(X);
          if (prev) {
            const am = (prev.a + a) / 2, bm = (prev.b + b) / 2, zm = (prev.z + X[2]) / 2, w = (prev.p[2] + p[2]) / 2;
            const bo = boost(am, bm, zm), f = pl.flatFade != null ? pl.flatFade : fade(zm);
            stroke(prev.p, p, .55 * I * pl.alpha * f * (major ? 1.5 : 1) * (1 + bo), gr.line * clamp(w, .45, 1.7) * (major ? 2.2 : 1) * (1 + bo * .5));
          }
          prev = { p, a, b, z: X[2] };
        }
      };
      for (const pl of planes) {
        const sa = dot(mv, pl.A), sb = dot(mv, pl.B);
        const iA = [Math.ceil((pl.a0 - sa) / cell), Math.floor((pl.a1 - sa) / cell)], iB = [Math.ceil((pl.b0 - sb) / cell), Math.floor((pl.b1 - sb) / cell)];
        const isMajor = n => gr.major > 0 && ((n % gr.major) + gr.major) % gr.major === 0;
        if (gr.pattern === 'lines' || gr.pattern === 'lanes') {
          for (let n = iA[0]; n <= iA[1]; n++) { const a = sa + n * cell; line(pl, a, pl.b0, a, pl.b1, isMajor(n)); }
          if (gr.pattern === 'lines') for (let n = iB[0]; n <= iB[1]; n++) { const b = sb + n * cell; line(pl, pl.a0, b, pl.a1, b, isMajor(n)); }
        } else {   // dots or crosses where the lines would meet
          const arm = cell * .16;
          for (let i = iA[0]; i <= iA[1]; i++) for (let j = iB[0]; j <= iB[1]; j++) {
            const a = sa + i * cell, b = sb + j * cell, z = zOf(pl, a, b);
            if (z > zNear || z < zFar) continue;
            const X = pt(pl, a, b), p = proj(X);
            if (p[0] < -20 || p[0] > Wc + 20 || p[1] < -20 || p[1] > Hc + 20) continue;
            const major = isMajor(i) && isMajor(j), bo = boost(a, b, X[2]);
            const alpha = .7 * I * pl.alpha * (pl.flatFade != null ? pl.flatFade : fade(X[2])) * (major ? 1.5 : 1) * (1 + bo);
            if (alpha < .01) continue;
            if (gr.pattern === 'dots') {
              const s = gr.line * 2.2 * clamp(p[2], .35, 1.8) * (major ? 1.8 : 1) * (1 + bo * .5);
              const dotAt = (r, al) => { ctx.globalAlpha = Math.min(1, al); if (r < 1.4) ctx.fillRect(p[0] - r, p[1] - r, r * 2, r * 2); else { ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.2832); ctx.fill(); } };
              if (gr.glow) dotAt(s * 1.9, alpha * .18);
              dotAt(s / 2, alpha);
            } else {
              const w = gr.line * clamp(p[2], .45, 1.7) * (major ? 1.8 : 1);
              stroke(proj(pt(pl, a - arm, b)), proj(pt(pl, a + arm, b)), alpha, w);
              stroke(proj(pt(pl, a, b - arm)), proj(pt(pl, a, b + arm)), alpha, w);
            }
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    // where the floor meets the sky: a glow, or a striped sun sitting on it
    function horizon(ctx, F, gr) {
      if (gr.horizon === 'none') return;
      const Wc = floorCv.width / fdpr, Hc = floorCv.height / fdpr, I = gridI();
      const d = F.e2.map(v => -v);
      const hx = d[2] < -1e-3 ? G.O[0] + d[0] * G.P / -d[2] : G.O[0], hy = d[2] < -1e-3 ? G.O[1] + d[1] * G.P / -d[2] : G.O[1];
      if (gr.horizon === 'sun') {
        const r = Math.min(Wc, Hc) * .16, base = clamp(hy, Hc * .22, Hc * .62), cx = clamp(hx, Wc * .25, Wc * .78), cy = base - r * .3;
        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, Wc, base); ctx.clip();
        const g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
        g.addColorStop(0, hiColor); g.addColorStop(1, getComputedStyle(sh).getPropertyValue('--env-a').trim() || gridCol);
        ctx.globalAlpha = .75 * I; ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'destination-out';
        for (let n = 0; n < 7; n++) ctx.fillRect(cx - r, cy + r * (.02 + n * .14), r * 2, r * (.025 + n * .022));
        ctx.restore();
      }
      if (hy > -Hc * .2 && hy < Hc * 1.2) {
        const g = ctx.createLinearGradient(0, hy - Hc * .24, 0, hy + Hc * .04);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(.86, gridCol); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = .24 * I; ctx.fillStyle = g; ctx.fillRect(0, hy - Hc * .24, Wc, Hc * .28); ctx.globalAlpha = 1;
      }
    }

    // a glossy floor: each piece mirrored in it, fading away from where it would touch
    const accents = cards.map(c => { const v = c.style.getPropertyValue('--accent').trim(); return /^#[0-9a-f]{6}$/i.test(v) ? v : '#888888'; });
    function reflections(ctx, F) {
      const I = gridI();
      for (let i = 0; i < N; i++) {
        const S = at[i]; if (!(S.o > .02)) continue;
        const cs = corners(S); if (cs.some(X => dot([X[0] - F.o[0], X[1] - F.o[1], X[2] - F.o[2]], F.nd) > 0)) continue;
        const m = cs.map(X => { const h = dot([X[0] - F.o[0], X[1] - F.o[1], X[2] - F.o[2]], F.nd); return proj(along(X, F.nd, -2 * h)); });
        if (m.some(p => p[2] <= 0 || p[2] > 8)) continue;
        const near = [(m[2][0] + m[3][0]) / 2, (m[2][1] + m[3][1]) / 2], far = [(m[0][0] + m[1][0]) / 2, (m[0][1] + m[1][1]) / 2];
        const g = ctx.createLinearGradient(near[0], near[1], far[0], far[1]);
        g.addColorStop(0, accents[i]); g.addColorStop(.7, accents[i] + '00');
        ctx.globalAlpha = .32 * S.o * I; ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(m[0][0], m[0][1]); for (let n = 1; n < 4; n++) ctx.lineTo(m[n][0], m[n][1]); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // a pool of light on the floor under the chosen piece
    function pool(ctx, F) {
      const S = at[shown]; if (!S || !(S.o > .02)) return;
      const X = [S.x, S.yb, S.z], h = dot([X[0] - F.o[0], X[1] - F.o[1], X[2] - F.o[2]], F.nd), c = along(X, F.nd, -h);
      const rad = G.cw * 1.15, pc = proj(c);
      const ring = Array.from({ length: 28 }, (_, n) => { const a = n / 28 * 6.2832; return proj(along(along(c, F.e1, Math.cos(a) * rad), F.e2, Math.sin(a) * rad)); });
      const rr = Math.max(...ring.map(p => Math.hypot(p[0] - pc[0], p[1] - pc[1])));
      const g = ctx.createRadialGradient(pc[0], pc[1], 0, pc[0], pc[1], rr);
      g.addColorStop(0, gridCol); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = .38 * gridI(); ctx.fillStyle = g;
      ctx.beginPath(); ring.forEach((p, n) => n ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // shadows: each card's corners followed along the light onto the floor
    function shadows(ctx, F, Ls) {
      const ln = dot(Ls, F.nd); if (ln > -.05) return;
      const OFF = 10000;
      ctx.fillStyle = '#000';
      for (let i = 0; i < N; i++) {
        const S = at[i]; if (!(S.o > .02)) continue;
        const pts = []; let height = 0;
        for (const X of corners(S)) {
          const h = dot([X[0] - F.o[0], X[1] - F.o[1], X[2] - F.o[2]], F.nd), s = h / ln;
          if (s < 0) { pts.length = 0; break; }
          const Sp = along(X, Ls, -s);
          if (Sp[2] > G.P - 60) { pts.length = 0; break; }
          pts.push(proj(Sp)); height += -h / 4;
        }
        if (pts.length < 4) continue;
        ctx.shadowColor = `rgba(0,0,0,${(S.o * clamp(.6 - height / 2200, .14, .6)).toFixed(3)})`;
        ctx.shadowBlur = (6 + height * .07) * fdpr; ctx.shadowOffsetX = OFF * fdpr; ctx.shadowOffsetY = 0;
        ctx.beginPath(); ctx.moveTo(pts[0][0] - OFF, pts[0][1]); for (let n = 1; n < 4; n++) ctx.lineTo(pts[n][0] - OFF, pts[n][1]); ctx.closePath(); ctx.fill();
      }
      ctx.shadowColor = 'rgba(0,0,0,0)'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0;
    }

    function setActive(i) {
      if (i === shown) return;
      shown = i;
      const it = data[i];
      cards.forEach((c, n) => { c.classList.toggle('on', n === i); c.tabIndex = n === i ? 0 : -1; });
      ticks.forEach((t, n) => t.setAttribute('aria-current', String(n === i)));
      $('#sh-count').textContent = String(i + 1).padStart(2, '0');
      $('#sh-kind').textContent = `${it.k} · ${it.c}`;
      const title = $('#sh-title'); title.textContent = it.t; title.href = it.h;
      $('#sh-blurb').textContent = it.b;
      $('#sh-open').href = it.h;
      // the backdrop takes on the chosen piece's colours
      const cs = cards[i].style;
      if (cs.getPropertyValue('--accent')) sh.style.setProperty('--env-a', cs.getPropertyValue('--accent'));
      if (cs.getPropertyValue('--ink')) sh.style.setProperty('--env-b', cs.getPropertyValue('--ink'));
      pulseAt = colorAt = clock();   // the grid ripples out from the new piece and takes on its colour
      now.classList.remove('swap'); void now.offsetWidth; now.classList.add('swap');
      try { sessionStorage.setItem('sh:i', String(i)); } catch (e) {}
    }

    let snapTimer = 0;
    const touched = () => sh.classList.add('used');
    const snapSoon = () => { clearTimeout(snapTimer); snapTimer = setTimeout(() => { target = clamp(Math.round(target), 0, N - 1); }, 140); };
    const go = n => { target = clamp(Math.round(target) + n, 0, N - 1); touched(); };
    const jump = i => { target = clamp(i, 0, N - 1); touched(); };

    // wheel and trackpad: about one piece per notch
    sh.addEventListener('wheel', e => {
      e.preventDefault();
      const dl = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      const unit = e.deltaMode === 1 ? 36 : e.deltaMode === 2 ? 400 : 1;
      target = clamp(target + clamp(dl * unit / 120, -1, 1), -0.4, N - 0.6);
      touched(); snapSoon();
    }, { passive: false });

    // drag with finger or mouse: up or left moves forward
    let drag = null;
    sh.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('.sh-now, .sh-ticks, .topbar')) return;
      drag = { x: e.clientX, y: e.clientY, t: target, moved: false, id: e.pointerId };
    });
    addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 6) { drag.moved = true; try { sh.setPointerCapture(e.pointerId); } catch (er) {} }
      if (drag.moved) { target = clamp(drag.t - (dx + dy) / (150 * G.k), -0.4, N - 0.6); touched(); }
    });
    const endDrag = () => { if (drag && drag.moved) { snapSoon(); sh.dataset.dragged = '1'; setTimeout(() => delete sh.dataset.dragged, 0); } drag = null; };
    addEventListener('pointerup', endDrag); addEventListener('pointercancel', endDrag);

    // clicking a piece in the row brings it forward; clicking the chosen one opens it
    cards.forEach((c, i) => {
      c.addEventListener('click', e => {
        if (sh.dataset.dragged) { e.preventDefault(); return; }
        if (i !== Math.round(target)) { e.preventDefault(); jump(i); }
      });
      c.addEventListener('pointerenter', () => { hover = i; });
      c.addEventListener('pointerleave', () => { if (hover === i) hover = -1; });
      c.addEventListener('focus', () => { if (i !== Math.round(target)) jump(i); });
    });
    ticks.forEach((t, i) => t.addEventListener('click', () => jump(i)));

    addEventListener('keydown', e => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest('input, textarea, select')) return;
      const k = e.key;
      if (['ArrowDown', 'ArrowRight', 'PageDown', 'j'].includes(k) || (k === ' ' && !e.shiftKey)) { e.preventDefault(); go(1); }
      else if (['ArrowUp', 'ArrowLeft', 'PageUp', 'k'].includes(k) || (k === ' ' && e.shiftKey)) { e.preventDefault(); go(-1); }
      else if (k === 'Home') { e.preventDefault(); jump(0); }
      else if (k === 'End') { e.preventDefault(); jump(N - 1); }
      else if (k === 'Enter' && !e.target.closest('a, button')) { location.href = data[Math.round(target)].h; }
    });

    // Manage -> Customize sends the look while you edit it (same site only)
    addEventListener('message', e => { if (e.origin === location.origin && e.data && e.data.type === 'sh-look') applyLook(e.data.look, true); });

    let look = {}; try { look = JSON.parse($('#sh-look').textContent); } catch (e) {}
    applyLook(look, false);
    let resizeTimer = 0;
    addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(measure, 120); });
    measure();
    window.__shFit = measure;   // used by the layout editor in Manage after it moves the text
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);   // the catch phrase changes size when its font arrives
    setActive(target);
    requestAnimationFrame(() => sh.classList.add('ready'));

    const t0 = T0;
    let last = t0;
    (function frame(nowT) {
      const time = (nowT - t0) / 1000, dt = Math.min(.05, Math.max(0, (nowT - last) / 1000)); last = nowT;
      if (reduce) { pos = target; vel = 0; }
      else { vel += (target - pos) * 0.075; vel *= 0.74; pos += vel; }
      for (let i = 0; i < N; i++) {
        const rate = reduce ? 1 : 0.1 + 0.16 / (1 + Math.abs(i - pos) * 0.45);
        p[i] += (pos - p[i]) * rate;
        place(i, time);
      }
      // fade cards that pass under the catch phrase or the piece's text
      for (let i = 0; i < N; i++) {
        const r = cards[i].getBoundingClientRect();
        const under = avoid.some(a => r.left < a.right && r.right > a.left && r.top < a.bottom && r.bottom > a.top);
        fade[i] += ((under ? 0 : 1) - fade[i]) * (reduce ? 1 : 0.18);
      }
      const L = lights();
      for (let i = 0; i < N; i++) shade(i, L.tex);
      drawFloor(L.drop, time);
      shPut('--par', (pos * 14).toFixed(1) + 'px');
      setActive(clamp(Math.round(target), 0, N - 1));
      if (anim && !reduce) anim.step(dt);
      requestAnimationFrame(frame);
    })(t0);
  })();
})();
