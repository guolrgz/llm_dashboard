/* =========================================================
   Dashboard charts (hand-rolled SVG, no dependencies)
   ========================================================= */
(function () {
  'use strict';

  /* ---------------------------------------------------------
   * Data
   * ------------------------------------------------------- */
  // 24h request series (0.25h resolution, values in requests)
  const HOURS = [];
  const TOTAL = [
    9900, 11900, 13900, 15900, 15900, 17200, 20000, 23000,
    25100, 27700, 29300, 31100, 33200, 34200, 35200, 34200,
    35200, 36200, 36200, 36200, 34200, 33200, 33200, 33200,
    34200, 35200, 35200, 36200, 37200, 39200, 41600, 43300,
    44300, 45300, 47000, 49400, 52400, 54700, 57500, 59500,
    59500, 58500, 56500, 53400, 51400, 50400, 49400, 49400,
    50400, 52400, 54400, 57500, 59500, 60500, 60500, 59500,
    58500, 58500, 58500, 59500, 61500, 61500, 61500, 61500,
    61500, 59500, 57500, 55400, 53400, 51200, 50400, 50400,
    50400, 51400, 53400, 56500, 59600, 62500, 66000, 71500,
    78230, 81000, 82200, 82700, 82800, 82800, 82600, 82200,
    81500, 80500, 79500, 78000, 76000, 74000, 71500,
  ];
  const SUCCESS = [
    8900, 8900, 9900, 10900, 10900, 11900, 12900, 14800,
    17000, 20000, 22000, 24700, 27200, 29100, 30100, 29100,
    29100, 30100, 30100, 29100, 27200, 26100, 24100, 24100,
    24100, 25100, 26100, 28100, 30800, 33200, 35200, 36200,
    37200, 38200, 39900, 42300, 44700, 46400, 48400, 50300,
    50400, 49400, 47900, 45300, 43300, 41300, 41300, 41300,
    42800, 45300, 47500, 50400, 52400, 54400, 54400, 54400,
    53400, 53400, 54400, 55400, 56500, 56500, 56500, 56300,
    55400, 55400, 53400, 51900, 49000, 46100, 44200, 43300,
    43300, 44900, 47600, 51000, 54600, 63000, 69000, 75200,
    77102, 78200, 79000, 78800, 78600, 78400, 78200, 77600,
    76800, 75800, 74500, 73000, 71200, 69600, 69000,
  ];
  for (let i = 0; i < TOTAL.length; i++) HOURS.push(i * 0.25);

  const KPI_SPARKS = {
    requests: [50, 49, 47, 43, 40, 38, 40, 42, 41, 39, 38, 40, 43, 44, 40, 33, 28, 25, 26, 28, 26, 19, 14, 15, 18, 21, 22, 21, 17, 13, 10, 5, 2, 4],
    tokens:   [54, 52, 47, 44, 43, 45, 47, 46, 44, 42, 45, 48, 49, 44, 37, 32, 28, 28, 31, 30, 24, 17, 16, 19, 23, 25, 24, 20, 15, 12, 7, 3, 3],
    success:  [47, 43, 39, 35, 34, 37, 40, 38, 35, 34, 37, 41, 41, 36, 29, 24, 19, 15, 14, 13, 12, 7, 7, 11, 15, 18, 15, 9, 5, 4, 2, 2, 4]
  };
  const SPARK_TONES = {
    blue:   { line: '#3b82f6', stop: '#3b82f6' },
    green:  { line: '#10b981', stop: '#10b981' },
    purple: { line: '#8b5cf6', stop: '#8b5cf6' }
  };

  const NS = 'http://www.w3.org/2000/svg';
  const el = (name, attrs) => {
    const node = document.createElementNS(NS, name);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  };

  /* ---------------------------------------------------------
   * Smooth (monotone cubic) path from points
   * ------------------------------------------------------- */
  function monotonePath(pts) {
    const n = pts.length;
    if (n < 2) return '';
    const dx = [], dy = [], slope = [];
    for (let i = 0; i < n - 1; i++) {
      dx[i] = pts[i + 1][0] - pts[i][0];
      dy[i] = pts[i + 1][1] - pts[i][1];
      slope[i] = dy[i] / dx[i];
    }
    const m = [slope[0]];
    for (let i = 1; i < n - 1; i++) {
      if (slope[i - 1] * slope[i] <= 0) m[i] = 0;
      else {
        const w1 = 2 * dx[i] + dx[i - 1];
        const w2 = dx[i] + 2 * dx[i - 1];
        m[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]);
      }
    }
    m[n - 1] = slope[n - 2];
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < n - 1; i++) {
      const x0 = pts[i][0], y0 = pts[i][1], x1 = pts[i + 1][0], y1 = pts[i + 1][1];
      const c1x = x0 + dx[i] / 3, c1y = y0 + (m[i] * dx[i]) / 3;
      const c2x = x1 - dx[i] / 3, c2y = y1 - (m[i + 1] * dx[i]) / 3;
      d += `C${c1x},${c1y} ${c2x},${c2y} ${x1},${y1}`;
    }
    return d;
  }

  /* =========================================================
   * Line chart
   * ======================================================= */
  function renderLineChart() {
    const wrap = document.getElementById('chartWrap');
    const svg = document.getElementById('lineChart');
    const tip = document.getElementById('chartTip');
    if (!wrap || !svg || !tip) return;

    const W = Math.max(360, Math.round(wrap.clientWidth));
    const H = Math.max(200, Math.round(wrap.clientHeight));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.textContent = '';

    const PLOT = { left: 44, right: W, top: 17.5, bottom: 215.5 };
    const plotW = PLOT.right - PLOT.left;
    const plotH = PLOT.bottom - PLOT.top;
    const MAX = 100000;
    const xOf = (h) => PLOT.left + (h / 24) * plotW;
    const yOf = (v) => PLOT.bottom - (v / MAX) * plotH;

    /* defs: area gradients */
    const defs = el('defs');
    const mkGrad = (id, color, topOpacity) => {
      const g = el('linearGradient', { id, x1: '0', y1: '0', x2: '0', y2: '1' });
      g.appendChild(el('stop', { offset: '0', 'stop-color': color, 'stop-opacity': topOpacity }));
      g.appendChild(el('stop', { offset: '0.45', 'stop-color': color, 'stop-opacity': topOpacity * 0.82 }));
      g.appendChild(el('stop', { offset: '0.8', 'stop-color': color, 'stop-opacity': topOpacity * 0.28 }));
      g.appendChild(el('stop', { offset: '1', 'stop-color': color, 'stop-opacity': 0 }));
      return g;
    };
    defs.appendChild(mkGrad('gradBlue', '#3478f2', '0.16'));
    defs.appendChild(mkGrad('gradGreen', '#5fd0a0', '0.13'));
    svg.appendChild(defs);

    /* horizontal grid + y labels */
    const gridG = el('g');
    const yTicks = [0, 25000, 50000, 75000, 100000];
    const yLabel = { 0: '0', 25000: '25k', 50000: '50k', 75000: '75k', 100000: '100k' };
    yTicks.forEach((v) => {
      const y = Math.round(yOf(v)) + 0.5;
      gridG.appendChild(el('line', { x1: PLOT.left, y1: y, x2: PLOT.right, y2: y, stroke: '#eef0f3', 'stroke-width': 1 }));
      const t = el('text', {
        x: PLOT.left - 14, y: y + 1, 'text-anchor': 'end',
        fill: '#6b7280', 'font-size': 12.5, 'font-family': 'inherit'
      });
      t.textContent = yLabel[v];
      gridG.appendChild(t);
    });

    /* vertical grid + x labels */
    /* vertical gridlines (positions measured from the design reference) */
    const sx = (plotW) / 752; // scale factor relative to the reference plot width
    const scaleX = (v) => PLOT.left + (v - 44) * sx;
    const vGrid = [118, 242, 366, 490, 614, 738].map(scaleX).map(Math.round);
    vGrid.forEach((gx) => {
      if (gx > PLOT.left && gx < PLOT.right) {
        gridG.appendChild(el('line', {
          x1: gx + 0.5, y1: PLOT.top, x2: gx + 0.5, y2: PLOT.bottom,
          stroke: '#efeff2', 'stroke-width': 1
        }));
      }
    });
    /* x-axis labels (the reference places them slightly right of the gridlines) */
    const xLabels = [74, 202, 331, 457, 584, 708].map(scaleX).map(Math.round);
    xLabels.forEach((lx, i) => {
      const t = el('text', {
        x: lx, y: PLOT.bottom + 33, 'text-anchor': 'middle',
        fill: '#6b7280', 'font-size': 12.5, 'font-family': 'inherit'
      });
      t.textContent = `${String(i * 4).padStart(2, '0')}:00`;
      gridG.appendChild(t);
    });
    svg.appendChild(gridG);

    /* series */
    const totalPts = HOURS.map((h, i) => [xOf(h), yOf(TOTAL[i])]);
    const successPts = HOURS.map((h, i) => [xOf(h), yOf(SUCCESS[i])]);

    const areaPath = (pts) => `${monotonePath(pts)}L${pts[pts.length - 1][0]},${PLOT.bottom}L${pts[0][0]},${PLOT.bottom}Z`;

    const gBlue = el('g');
    gBlue.appendChild(el('path', { d: areaPath(totalPts), fill: 'url(#gradBlue)' }));
    gBlue.appendChild(el('path', {
      d: monotonePath(totalPts), fill: 'none', stroke: '#3478f2',
      'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    }));
    svg.appendChild(gBlue);

    const gGreen = el('g');
    gGreen.appendChild(el('path', { d: areaPath(successPts), fill: 'url(#gradGreen)' }));
    gGreen.appendChild(el('path', {
      d: monotonePath(successPts), fill: 'none', stroke: '#5fd0a0',
      'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    }));
    svg.appendChild(gGreen);

    /* interactive marker + crosshair */
    const hoverLine = el('line', {
      x1: 0, y1: PLOT.top, x2: 0, y2: PLOT.bottom,
      stroke: '#c9d3e6', 'stroke-width': 1, 'stroke-dasharray': '3 4', opacity: 0
    });
    const dotTotal = el('circle', { r: 4, fill: '#3478f2', stroke: '#fff', 'stroke-width': 2, opacity: 0 });
    const dotSuccess = el('circle', { r: 4, fill: '#5fd0a0', stroke: '#fff', 'stroke-width': 2, opacity: 0 });
    svg.appendChild(hoverLine);
    svg.appendChild(dotTotal);
    svg.appendChild(dotSuccess);

    /* tooltip default placement: reference shows the 20:00 point */
    const placeTip = (hour) => {
      const idx = Math.max(0, Math.min(TOTAL.length - 1, Math.round(hour * 4)));
      const x = xOf(HOURS[idx]);
      const yT = yOf(TOTAL[idx]);
      const yS = yOf(SUCCESS[idx]);
      dotTotal.setAttribute('cx', x);
      dotTotal.setAttribute('cy', yT);
      dotSuccess.setAttribute('cx', x);
      dotSuccess.setAttribute('cy', yS);
      hoverLine.setAttribute('x1', x);
      hoverLine.setAttribute('x2', x);
      const fmt = (n) => n.toLocaleString('en-US');
      const hourVal = HOURS[idx];
      const hh = String(Math.floor(hourVal)).padStart(2, '0');
      const mm = hourVal % 1 ? '15' : '00';
      tip.querySelector('.tip-time').textContent = `${hh}:${mm}`;
      const rows = tip.querySelectorAll('.tip-row b');
      rows[0].textContent = fmt(TOTAL[idx]);
      rows[1].textContent = fmt(SUCCESS[idx]);
      /* centred above the hovered point (as in the design reference) */
      let left = x - 79.5;
      left = Math.max(4, Math.min(W - 161, left));
      tip.style.left = `${Math.round(left)}px`;
      tip.style.top = '7px';
      tip.style.opacity = 1;
      dotTotal.setAttribute('opacity', 1);
      dotSuccess.setAttribute('opacity', 1);
      hoverLine.setAttribute('opacity', 1);
    };

    /* hover behaviour: nearest data point */
    const onMove = (ev) => {
      const rect = wrap.getBoundingClientRect();
      const mx = ev.clientX - rect.left;
      const h = ((mx - PLOT.left) / plotW) * 24;
      placeTip(Math.max(0, Math.min(23.5, Math.round(h * 4) / 4)));
    };
    const onLeave = () => placeTip(20);

    if (!wrap.dataset.bound) {
      wrap.addEventListener('mousemove', onMove);
      wrap.addEventListener('mouseleave', onLeave);
      wrap.dataset.bound = '1';
    }
    placeTip(20);
  }

  /* =========================================================
   * Donut chart
   * ======================================================= */
  function renderDonut() {
    const svg = document.getElementById('donutChart');
    if (!svg) return;
    svg.textContent = '';

    const C = 110, R = 92, SW = 35;
    const segments = [
      { from: 0,     to: 145,   color: '#518af6' }, // GPT-4o
      { from: 145,   to: 228,   color: '#f1ad7c' }, // Qwen-Max (drawn in this order, as in the reference)
      { from: 228,   to: 274,   color: '#97d486' }, // Claude-3.5
      { from: 274,   to: 326,   color: '#70b7f6' }, // unlabelled accent segment present in the reference
      { from: 326,   to: 360,   color: '#a6baf9' }  // 其他
    ];
    const gapDeg = 0.8;
    const pt = (deg, r) => {
      const a = ((deg - 90) * Math.PI) / 180;
      return [C + r * Math.cos(a), C + r * Math.sin(a)];
    };
    segments.forEach((s) => {
      const a0 = s.from + gapDeg;
      const a1 = s.to - gapDeg;
      const [x0, y0] = pt(a0, R);
      const [x1, y1] = pt(a1, R);
      const large = a1 - a0 > 180 ? 1 : 0;
      const d = `M${x0.toFixed(2)},${y0.toFixed(2)}A${R},${R} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
      svg.appendChild(el('path', {
        d, fill: 'none', stroke: s.color, 'stroke-width': SW, 'stroke-linecap': 'butt'
      }));
    });
  }

  /* =========================================================
   * KPI sparklines
   * ======================================================= */
  function renderSparklines() {
    document.querySelectorAll('.kpi-spark').forEach((host) => {
      const key = host.dataset.spark;
      const tone = SPARK_TONES[host.dataset.tone] || SPARK_TONES.blue;
      const ys = KPI_SPARKS[key];
      if (!ys) return;

      const W = 184, H = 84;
      host.textContent = '';
      const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none' });
      const gid = `sparkGrad-${key}`;
      const defs = el('defs');
      const g = el('linearGradient', { id: gid, x1: '0', y1: '0', x2: '0', y2: '1' });
      g.appendChild(el('stop', { offset: '0', 'stop-color': tone.stop, 'stop-opacity': '0.20' }));
      g.appendChild(el('stop', { offset: '0.45', 'stop-color': tone.stop, 'stop-opacity': '0.13' }));
      g.appendChild(el('stop', { offset: '0.75', 'stop-color': tone.stop, 'stop-opacity': '0.06' }));
      g.appendChild(el('stop', { offset: '1', 'stop-color': tone.stop, 'stop-opacity': '0' }));
      defs.appendChild(g);
      svg.appendChild(defs);

      const x0 = 11, x1 = 179;
      const pts = ys.map((y, i) => [x0 + ((x1 - x0) * i) / (ys.length - 1), Math.max(1, y)]);
      const line = monotonePath(pts);
      svg.appendChild(el('path', {
        d: `${line}L${pts[pts.length - 1][0]},${H}L${pts[0][0]},${H}Z`,
        fill: `url(#${gid})`
      }));
      svg.appendChild(el('path', {
        d: line, fill: 'none', stroke: tone.line, 'stroke-width': 2,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round'
      }));
      host.appendChild(svg);
    });
  }

  /* =========================================================
   * UI interactions
   * ======================================================= */
  function initInteractions() {
    /* time range segmented control */
    const segBtns = [...document.querySelectorAll('.seg-btn')];
    segBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        segBtns.forEach((b) => {
          b.classList.remove('is-active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('is-active');
        btn.setAttribute('aria-selected', 'true');
      });
    });

    /* sidebar navigation */
    document.querySelectorAll('.nav .nav-item').forEach((item) => {
      item.addEventListener('click', (ev) => {
        ev.preventDefault();
        document.querySelectorAll('.nav .nav-item').forEach((n) => n.classList.remove('is-active'));
        item.classList.add('is-active');
        if (isMobile()) setMobileOpen(false);
      });
    });

    document.querySelectorAll('.sidebar .nav-item').forEach((item) => {
      item.addEventListener('click', () => {
        if (isMobile()) setMobileOpen(false);
      });
    });

    /* hamburger — collapses the sidebar on desktop, opens the drawer on small screens */
    const app = document.querySelector('.app');
    const burger = document.querySelector('.hamburger');
    const backdrop = document.querySelector('.sidebar-backdrop');
    const mobileQuery = window.matchMedia('(max-width: 900px)');
    const isMobile = () => mobileQuery.matches;

    function syncBurger(expanded) {
      if (!burger) return;
      burger.setAttribute('aria-expanded', String(expanded));
      burger.setAttribute('aria-label', expanded ? '关闭菜单' : '打开菜单');
    }

    function setMobileOpen(open) {
      app.classList.toggle('sidebar-open', open);
      document.body.classList.toggle('sidebar-locked', open);
      syncBurger(open);
    }

    if (burger) {
      burger.addEventListener('click', () => {
        if (isMobile()) {
          setMobileOpen(!app.classList.contains('sidebar-open'));
          return;
        }
        app.classList.toggle('sidebar-collapsed');
        syncBurger(!app.classList.contains('sidebar-collapsed'));
        requestAnimationFrame(() => renderLineChart());
      });
    }
    if (backdrop) backdrop.addEventListener('click', () => setMobileOpen(false));
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && app.classList.contains('sidebar-open')) setMobileOpen(false);
    });
    const onViewportChange = () => {
      setMobileOpen(false);
      app.classList.remove('sidebar-collapsed');
      syncBurger(true);
      requestAnimationFrame(() => renderLineChart());
    };
    if (mobileQuery.addEventListener) mobileQuery.addEventListener('change', onViewportChange);
    else if (mobileQuery.addListener) mobileQuery.addListener(onViewportChange);
  }

  /* ---------------------------------------------------------
   * boot
   * ------------------------------------------------------- */
  function boot() {
    renderSparklines();
    renderDonut();
    renderLineChart();
    initInteractions();

    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => renderLineChart());
    };
    window.addEventListener('resize', onResize);
    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver(onResize);
      const wrap = document.getElementById('chartWrap');
      if (wrap) ro.observe(wrap);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
