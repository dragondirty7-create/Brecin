/*
 * Project Presser logo reveal.
 * Needs window.PRESSER_GEO (presser-geo.js). Deterministic: frame(t) draws the
 * exact same picture for the same t, so the page, the video render and the app
 * all show the same reveal.
 *
 *   const r = PresserReveal.create(canvas, { layout: "stage" | "tile", plain?, calm? });
 *   r.play();          // runs once, ends on the final logo
 *   r.frame(t);        // draw any moment (seconds)
 *   r.duration         // seconds
 */
(function () {
  "use strict";
  var NIGHT = "#141311", INK = "#1b1a17", AMBER = "#e0a54a", GOLD = "#f6d48f",
      HOT = "#fff6de", CREAM = "#f4ead2";

  // timeline (seconds)
  var T_EMBER = 0.35, T_FILL = 1.85, T_STRIKE = T_EMBER + T_FILL, T_WORD = 0.9, DURATION = 5.2;

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function smooth(e0, e1, x) { var t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rgb(hex) { var n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  // returns hex, so mixes can be chained
  function mix(a, b, k) {
    a = rgb(a); b = rgb(b);
    return "#" + [0, 1, 2].map(function (i) {
      return ("0" + Math.round(clamp(a[i] + (b[i] - a[i]) * k, 0, 255)).toString(16)).slice(-2);
    }).join("");
  }

  var shared = null;   // decoded once per page
  function geo() {
    if (shared) return shared;
    var G = window.PRESSER_GEO, bin = atob(G.crown), crown = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) crown[i] = bin.charCodeAt(i);
    shared = { G: G, crown: crown, amber: new Path2D(G.amber), gold: new Path2D(G.gold), lines: new Path2D(G.lines) };
    return shared;
  }

  // Lightning by recursive midpoint displacement, seeded so every render matches.
  function buildArc(rand, x1, y1, x2, y2, w, depth, out, branching) {
    var len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 6 || depth > 9) { out.push([x1, y1, x2, y2, w]); return; }
    var nx = -(y2 - y1) / len, ny = (x2 - x1) / len, off = (rand() - 0.5) * 0.56 * len;
    var mx = (x1 + x2) / 2 + nx * off, my = (y1 + y2) / 2 + ny * off;
    buildArc(rand, x1, y1, mx, my, w, depth + 1, out, branching);
    buildArc(rand, mx, my, x2, y2, w, depth + 1, out, branching);
    if (w > 0.6 && rand() < branching * (1 - depth / 10)) {
      var ang = Math.atan2(y2 - y1, x2 - x1) + (rand() < 0.5 ? -1 : 1) * (0.35 + rand() * 0.5);
      var bl = len * (0.45 + rand() * 0.45);
      buildArc(rand, mx, my, mx + Math.cos(ang) * bl, my + Math.sin(ang) * bl, w * 0.5, depth + 2, out, branching);
    }
  }

  function create(canvas, opts) {
    opts = opts || {};
    var layout = opts.layout || "stage";
    var g = geo(), G = g.G;
    var ctx = canvas.getContext("2d");
    var W = canvas.width, H = canvas.height;

    // geometry of the composition
    var S, OX, OY, groundY = 0, wordY = 0;
    if (layout === "stage") {
      S = (H * 0.6) / G.h; OX = W / 2 - G.w * S / 2; OY = H * 0.1;
      groundY = H * 0.835; wordY = H * 0.925;
    } else {                                   // "tile": the app icon, animated
      S = (H * 0.86) / G.h; OX = W / 2 - G.w * S / 2; OY = H / 2 - G.h * S / 2;
    }
    var tipX = OX + G.tip[0] * S, tipY = OY + G.tip[1] * S;

    // the strike, fixed per layout
    var rand = mulberry32(layout === "stage" ? 104 : 16);
    var arc = [], landX = tipX, landY;
    if (layout === "stage") { landX = tipX + W * 0.035; landY = groundY; }
    else { landX = tipX + W * 0.04; landY = H * 1.02; }
    buildArc(rand, tipX, tipY, landX, landY, layout === "stage" ? W * 0.0032 : W * 0.006, 0, arc, layout === "stage" ? 0.3 : 0.18);

    // offscreen layers
    var mask = document.createElement("canvas"); mask.width = G.gw; mask.height = G.gh;
    var mctx = mask.getContext("2d"), mimg = mctx.createImageData(G.gw, G.gh);
    var glow = document.createElement("canvas"); glow.width = G.gw; glow.height = G.gh;
    var gctx = glow.getContext("2d"), gimg = gctx.createImageData(G.gw, G.gh);
    var buf = document.createElement("canvas"); buf.width = W; buf.height = H;
    var bctx = buf.getContext("2d");

    function drawMark(c, amber, gold, lines) {
      c.save(); c.translate(OX, OY); c.scale(S, S);
      c.fillStyle = amber; c.fill(g.amber);
      c.fillStyle = gold; c.fill(g.gold);
      c.fillStyle = lines; c.fill(g.lines);
      c.restore();
    }

    function background() {
      if (layout === "stage") {
        ctx.fillStyle = NIGHT; ctx.fillRect(0, 0, W, H);
        if (!opts.plain) {   // plain: no vignette, so the canvas blends into a full-screen stage
          var v = ctx.createRadialGradient(W / 2, H * 0.45, W * 0.1, W / 2, H * 0.45, W * 0.75);
          v.addColorStop(0, "rgba(255,240,210,0.035)"); v.addColorStop(1, "rgba(0,0,0,0.35)");
          ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
        }
      } else {
        ctx.clearRect(0, 0, W, H);
        var r = W * 0.219;   // same corner as the 512px icon (rx 112)
        ctx.beginPath();
        ctx.moveTo(r, 0); ctx.arcTo(W, 0, W, H, r); ctx.arcTo(W, H, 0, H, r);
        ctx.arcTo(0, H, 0, 0, r); ctx.arcTo(0, 0, W, 0, r); ctx.closePath();
        ctx.fillStyle = INK; ctx.fill();
        ctx.save(); ctx.clip();   // everything else stays inside the tile
      }
    }

    function frame(t) {
      background();
      var front = 254 * easeInOut(clamp((t - T_EMBER) / T_FILL, 0, 1)) + 14 * smooth(T_STRIKE, T_STRIKE + 0.3, t);
      var since = t - T_STRIKE;
      var flash = since >= 0 ? Math.exp(-since / 0.2) : 0;               // one flash, smooth decay
      var settle = smooth(T_STRIKE, T_STRIKE + 1.2, t);
      var ember = smooth(0, T_EMBER, t) * (1 - smooth(T_EMBER, T_EMBER + 0.4, t));

      // reveal mask: cells light up as the charge front passes them
      var c = g.crown, md = mimg.data, gd = gimg.data;
      for (var i = 0, n = c.length; i < n; i++) {
        var q = c[i], a = 0, b = 0;
        if (q < 255) {
          a = clamp((front - q) / 12, 0, 1);
          var d = Math.abs(front - q - 4);
          b = front < 268 ? clamp(1 - d / 9, 0, 1) : 0;
        }
        md[i * 4 + 3] = a * 255;
        gd[i * 4] = 255; gd[i * 4 + 1] = 236; gd[i * 4 + 2] = 190; gd[i * 4 + 3] = b * 255;
      }
      mctx.putImageData(mimg, 0, 0);
      gctx.putImageData(gimg, 0, 0);

      // the mark, warming from charged to settled, white-hot at the strike
      bctx.globalCompositeOperation = "source-over";
      bctx.clearRect(0, 0, W, H);
      var warm = 0.82 + 0.18 * settle;
      drawMark(bctx,
        mix(mix(INK, AMBER, warm), HOT, flash * 0.8),
        mix(mix(INK, GOLD, warm), HOT, flash * 0.9),
        INK);
      bctx.globalCompositeOperation = "destination-in";
      bctx.imageSmoothingEnabled = true;
      bctx.drawImage(mask, OX, OY, G.gw * G.cell * S, G.gh * G.cell * S);
      ctx.drawImage(buf, 0, 0);

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      // the leading edge of the charge
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(glow, OX, OY, G.gw * G.cell * S, G.gh * G.cell * S);
      // the ember at the crown before anything moves
      if (ember > 0) {
        var cx = OX + G.w * S * 0.62, cy = OY + 6 * S, rr = W * 0.05;
        var eg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
        eg.addColorStop(0, "rgba(255,230,170," + 0.9 * ember + ")"); eg.addColorStop(1, "rgba(255,230,170,0)");
        ctx.fillStyle = eg; ctx.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
      }
      // the strike
      if (since >= 0 && since < 1.2) {
        var I = Math.exp(-since / 0.22);
        ctx.lineCap = "round";
        [[9, 0.12, GOLD], [3.2, 0.35, GOLD], [1, 1, HOT]].forEach(function (p) {
          ctx.strokeStyle = p[2]; ctx.globalAlpha = p[1] * I;
          arc.forEach(function (s) { ctx.lineWidth = s[4] * p[0]; ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); ctx.stroke(); });
        });
        ctx.globalAlpha = 1;
        var lg = ctx.createRadialGradient(landX, landY, 0, landX, landY, W * 0.12);
        lg.addColorStop(0, "rgba(255,226,160," + 0.55 * I + ")"); lg.addColorStop(1, "rgba(255,226,160,0)");
        ctx.fillStyle = lg; ctx.fillRect(landX - W * 0.12, landY - W * 0.12, W * 0.24, W * 0.24);
        // sky flash only when the canvas IS the whole stage; full-screen hosts would show its edge
        if (layout === "stage" && !opts.calm && !opts.plain) { ctx.fillStyle = "rgba(246,212,143," + 0.07 * flash + ")"; ctx.fillRect(0, 0, W, H); }
      }
      ctx.restore();

      if (layout === "stage") {
        // the level line and the name, spreading out from where the strike landed
        var open = easeInOut(clamp((t - T_STRIKE - 0.05) / T_WORD, 0, 1));
        if (open > 0) {
          var x0 = W * 0.14, x1 = W * 0.86;
          var lx0 = landX - (landX - x0) * open, lx1 = landX + (x1 - landX) * open;
          ctx.fillStyle = mix(NIGHT, AMBER, 0.55 + 0.45 * Math.exp(-Math.max(0, since) / 0.6));
          ctx.fillRect(lx0, groundY - 1, lx1 - lx0, Math.max(2, W * 0.002));
          ctx.save();
          ctx.beginPath(); ctx.rect(lx0, groundY + 4, lx1 - lx0, H - groundY); ctx.clip();
          ctx.fillStyle = CREAM;
          ctx.font = "800 " + Math.round(W * 0.066) + "px 'Big Shoulders Display', 'Arial Narrow', Impact, sans-serif";
          ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
          if ("letterSpacing" in ctx) ctx.letterSpacing = Math.round(W * 0.012) + "px";
          ctx.fillText("PROJECT PRESSER", W / 2, wordY);
          ctx.restore();
        }
      } else {
        ctx.restore();   // tile clip
      }
    }

    var raf = 0;
    function play(onDone) {
      cancelAnimationFrame(raf);
      if (opts.calm) { frame(DURATION); if (onDone) onDone(); return; }
      var t0 = performance.now();
      (function tick(now) {
        var t = (now - t0) / 1000;
        frame(Math.min(t, DURATION));
        if (t < DURATION) raf = requestAnimationFrame(tick); else if (onDone) onDone();
      })(t0);
    }
    return { frame: frame, play: play, duration: DURATION, strikeAt: T_STRIKE };
  }

  window.PresserReveal = { create: create };
})();
