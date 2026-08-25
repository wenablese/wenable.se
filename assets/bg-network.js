/* Animated network background — shared across Wenable pages.
   Renders the drifting node/edge field into #bg-canvas (inside .site-bg).
   Respects prefers-reduced-motion: when reduced, the canvas stays blank
   and the CSS glow + grid carry the backdrop on their own. */
(function () {
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return;

  function start() {
    var canvas = document.getElementById("bg-canvas");
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0;
    var nodes = [];
    var NODE_COUNT, MAX_DIST;

    function resize() {
      W = canvas.clientWidth = window.innerWidth;
      H = canvas.clientHeight = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var area = W * H;
      NODE_COUNT = Math.max(60, Math.min(160, Math.round(area / 14000)));
      MAX_DIST = Math.min(W, H) * 0.18;
      if (MAX_DIST < 140) MAX_DIST = 140;
      if (MAX_DIST > 240) MAX_DIST = 240;

      nodes = [];
      for (var k = 0; k < NODE_COUNT; k++) {
        var ang = Math.random() * Math.PI * 2;
        var speed = 0.10 + Math.random() * 0.18;
        nodes.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed,
          r: Math.random() * 1.3 + 0.6,
          hot: Math.random() < 0.07
        });
      }
    }
    window.addEventListener("resize", resize);
    resize();

    function tick() {
      ctx.clearRect(0, 0, W, H);

      // update node positions — steady linear drift with edge wrap.
      for (var n = 0; n < nodes.length; n++) {
        var p = nodes[n];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -20) p.x = W + 20;
        if (p.x > W + 20) p.x = -20;
        if (p.y < -20) p.y = H + 20;
        if (p.y > H + 20) p.y = -20;
      }

      // edges
      for (var i2 = 0; i2 < nodes.length; i2++) {
        var a = nodes[i2];
        for (var j = i2 + 1; j < nodes.length; j++) {
          var b = nodes[j];
          var ddx = a.x - b.x, ddy = a.y - b.y;
          var d2 = ddx * ddx + ddy * ddy;
          if (d2 < MAX_DIST * MAX_DIST) {
            var d = Math.sqrt(d2);
            var t = 1 - d / MAX_DIST;
            var alpha = t * t * 0.55;
            var hot = a.hot || b.hot;
            ctx.strokeStyle = hot
              ? "rgba(243,144,25," + (alpha * 0.85).toFixed(3) + ")"
              : "rgba(143,195,255," + (alpha * 0.55).toFixed(3) + ")";
            ctx.lineWidth = hot ? 0.9 : 0.6;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // nodes on top
      for (var m = 0; m < nodes.length; m++) {
        var p2 = nodes[m];
        if (p2.hot) {
          ctx.fillStyle = "rgba(243,144,25,0.95)";
          ctx.shadowBlur = 14;
          ctx.shadowColor = "rgba(243,144,25,0.7)";
        } else {
          ctx.fillStyle = "rgba(220,232,248,0.75)";
          ctx.shadowBlur = 6;
          ctx.shadowColor = "rgba(160,200,255,0.35)";
        }
        ctx.beginPath();
        ctx.arc(p2.x, p2.y, p2.r + (p2.hot ? 0.8 : 0), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
