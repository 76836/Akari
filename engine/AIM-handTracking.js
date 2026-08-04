/**
 * AkariNet AIM — Hand Tracking (drop-in)
 * Include as: <script src="./engine/AIM-handTracking.js"></script>
 * Settings: localStorage key "akari_aim_cfg" (JSON). Enable path: "selectedAIMScript".
 */
(function (global) {
  'use strict';
  if (global.__AIM_HAND_TRACKING__) return;
  global.__AIM_HAND_TRACKING__ = true;

  var CFG_KEY = 'akari_aim_cfg';
  var DEFAULTS = {
    enabled: true,
    trackPt: 0,
    handSide: 'Any',
    sensitivity: 1.0,
    pinchSens: 1.0,
    smooth: 0.7,
    invX: false,
    invY: false,
    zone: { x: 0, y: 0, w: 1, h: 1 },
    refSizeAt1m: 0.15,
    minD: 0,
    maxD: 3,
    ignoreFar: true,
    requirePalm: true,
    showCam: false,
    captureRes: '480',
    modelComplexity: 0,
    dynamicRes: true
  };

  var RES_MAP = {
    '360': { w: 640, h: 360 },
    '480': { w: 640, h: 480 },
    '720': { w: 1280, h: 720 },
    '1080': { w: 1920, h: 1080 }
  };

  function loadCfg() {
    var cfg = Object.assign({}, DEFAULTS);
    try {
      var raw = localStorage.getItem(CFG_KEY);
      if (raw) cfg = Object.assign(cfg, JSON.parse(raw));
    } catch (e) {}
    return cfg;
  }

  var cfg = loadCfg();

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function injectUI() {
    var style = document.createElement('style');
    style.textContent =
      '#aim-banner{position:fixed;top:0;left:0;right:0;z-index:2147483000;height:22px;line-height:22px;font:12px/22px system-ui,sans-serif;color:#ffcc66;background:rgba(20,12,0,0.92);border-bottom:1px solid #664400;overflow:hidden;display:none;pointer-events:none;}' +
      '#aim-banner.show{display:block;}' +
      '#aim-banner span{display:inline-block;padding-left:100%;white-space:nowrap;animation:aim-marquee 12s linear infinite;}' +
      '@keyframes aim-marquee{0%{transform:translateX(0)}100%{transform:translateX(-100%)}}' +
      '#aim-cursor{position:fixed;width:20px;height:28px;pointer-events:none;z-index:2147483001;left:0;top:0;filter:drop-shadow(0 1px 2px rgba(0,0,0,.55));}' +
      '#aim-cursor svg{width:100%;height:100%;display:block;overflow:visible;}' +
      '#aim-cursor.pinch path{fill:#00ff9d;stroke:#003322;}' +
      '#aim-cursor.dim{opacity:.35;}' +
      '#aim-cursor.flip{transform:scaleX(-1);transform-origin:0 0;}' +
      '#aim-cam{position:fixed;top:28px;right:10px;width:120px;height:68px;z-index:2147482999;border:1px solid #333;border-radius:6px;overflow:hidden;background:#000;pointer-events:none;display:none;}' +
      '#aim-cam.show{display:block;}' +
      '#aim-cam video,#aim-cam canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scaleX(-1);}';
    document.head.appendChild(style);

    var banner = document.createElement('div');
    banner.id = 'aim-banner';
    banner.innerHTML = '<span id="aim-banner-text"></span>';
    document.body.appendChild(banner);

    var cam = document.createElement('div');
    cam.id = 'aim-cam';
    cam.innerHTML = '<video id="aim-video" autoplay playsinline muted></video><canvas id="aim-canvas"></canvas>';
    document.body.appendChild(cam);

    var cursor = document.createElement('div');
    cursor.id = 'aim-cursor';
    cursor.innerHTML =
      '<svg viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M1 1 L1 25 L7.5 19.5 L12.5 30 L16 28.5 L11 18 L20 18 Z" fill="#fff" stroke="#111" stroke-width="1.2" stroke-linejoin="round"/>' +
      '</svg>';
    document.body.appendChild(cursor);

    return {
      banner: banner,
      bannerText: document.getElementById('aim-banner-text'),
      cam: cam,
      video: document.getElementById('aim-video'),
      canvas: document.getElementById('aim-canvas'),
      cursor: cursor
    };
  }

  function setBanner(msg) {
    if (!ui) return;
    if (!msg) {
      ui.banner.classList.remove('show');
      return;
    }
    ui.bannerText.textContent = msg + '   ·   ' + msg + '   ·   ';
    ui.banner.classList.add('show');
  }

  /** Dispatch mouse events on host page and same-origin iframe documents under the point. */
  function interactAt(x, y, wasPinch, isPinch) {
    var targets = [];
    var el = document.elementFromPoint(x, y);
    if (el) targets.push({ el: el, doc: document, win: window });

    var node = el;
    while (node) {
      if (node.tagName === 'IFRAME') {
        try {
          var idoc = node.contentDocument;
          var iwin = node.contentWindow;
          if (idoc && iwin) {
            var rect = node.getBoundingClientRect();
            var ix = x - rect.left;
            var iy = y - rect.top;
            var inner = idoc.elementFromPoint(ix, iy);
            if (inner) targets.push({ el: inner, doc: idoc, win: iwin, x: ix, y: iy });
            node = inner;
            continue;
          }
        } catch (e) {}
      }
      break;
    }

    targets.forEach(function (t) {
      var cx = t.x != null ? t.x : x;
      var cy = t.y != null ? t.y : y;
      var opts = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, view: t.win };
      try {
        t.el.dispatchEvent(new MouseEvent('mousemove', opts));
        if (isPinch && !wasPinch) t.el.dispatchEvent(new MouseEvent('mousedown', opts));
        else if (!isPinch && wasPinch) {
          t.el.dispatchEvent(new MouseEvent('mouseup', opts));
          t.el.dispatchEvent(new MouseEvent('click', opts));
        }
        if (isPinch && t.el.tagName === 'INPUT' && t.el.type === 'range') {
          var r = t.el.getBoundingClientRect();
          var v = (cx - r.left) / (r.width || 1);
          t.el.value = parseFloat(t.el.min) + (parseFloat(t.el.max) - parseFloat(t.el.min)) * Math.max(0, Math.min(1, v));
          t.el.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } catch (e) {}
    });
  }

  var ui = null;
  var state = {
    cx: 0, cy: 0, sx: 0, sy: 0,
    isPinching: false, pinchReleased: true,
    lastHandX: null, lastHandY: null, lastHandLabel: null,
    lastHintTime: 0
  };
  var latest = { hasHand: false, sx: 0, sy: 0, isPinching: false, allowClick: true, flip: false };
  var processCanvas = null;
  var processCtx = null;
  var currentProcessSize = { w: 640, h: 480 };
  var lastScaleMode = 'mid';
  var hands = null;
  var cameraInstance = null;

  function getTargetProcessSize(handScale) {
    var mode;
    if (handScale > 0.23) mode = 'near';
    else if (handScale < 0.12) mode = 'far';
    else mode = 'mid';
    if (mode !== lastScaleMode) {
      if (lastScaleMode === 'near' && mode === 'mid' && handScale < 0.26) return { w: 480, h: 360 };
      if (lastScaleMode === 'far' && mode === 'mid' && handScale > 0.1) return { w: 720, h: 540 };
      lastScaleMode = mode;
    }
    if (mode === 'near') return { w: 480, h: 360 };
    if (mode === 'far') return { w: 720, h: 540 };
    return { w: 640, h: 480 };
  }

  function onResults(results) {
    var now = Date.now();
    if (!results.multiHandLandmarks || !results.multiHandLandmarks.length) {
      state.lastHandX = null;
      latest.hasHand = false;
      if (now - state.lastHintTime > 2000) setBanner('Hand lost — show an open palm to the camera');
      return;
    }
    state.lastHintTime = now;

    var activeHand = null, activeLabel = null, maxScale = -1;
    for (var i = 0; i < results.multiHandLandmarks.length; i++) {
      var lm = results.multiHandLandmarks[i];
      var label = results.multiHandedness[i].label;
      if (cfg.handSide !== 'Any' && label !== cfg.handSide) continue;
      var currentScale = Math.hypot(lm[9].x - lm[0].x, lm[9].y - lm[0].y);
      var estimatedDist = cfg.refSizeAt1m / currentScale;
      if (estimatedDist < cfg.minD || estimatedDist > cfg.maxD) {
        if (i === 0) setBanner(estimatedDist < cfg.minD ? 'Too close' : 'Too far');
        continue;
      }
      if (cfg.ignoreFar) {
        if (currentScale > maxScale) {
          maxScale = currentScale;
          activeHand = lm;
          activeLabel = label;
        }
      } else {
        activeHand = lm;
        activeLabel = label;
        maxScale = currentScale;
        break;
      }
    }

    if (!activeHand) {
      state.lastHandX = null;
      latest.hasHand = false;
      return;
    }

    if (cfg.dynamicRes) {
      var ns = getTargetProcessSize(maxScale);
      if (ns.w !== currentProcessSize.w) currentProcessSize = ns;
    }

    var flipCursor = !(activeHand[4].x < activeHand[9].x);

    var base = Math.hypot(activeHand[5].x - activeHand[17].x, activeHand[5].y - activeHand[17].y) || 1e-6;
    var v1x = activeHand[5].x - activeHand[0].x, v1y = activeHand[5].y - activeHand[0].y;
    var v2x = activeHand[17].x - activeHand[0].x, v2y = activeHand[17].y - activeHand[0].y;
    var zNorm = v1x * v2y - v1y * v2x;
    var area = Math.abs(zNorm) / 2;
    var fullness = (2 * area) / base / base;
    var minFullness = 0.4 / (cfg.sensitivity || 1);
    var windingOk = activeLabel === 'Right' ? zNorm > 0 : zNorm < 0;
    var palmOpen = windingOk && fullness > minFullness;

    if (cfg.requirePalm && !palmOpen) setBanner('Open palm to move cursor');
    else setBanner(null);

    var pinchDist = Math.hypot(activeHand[4].x - activeHand[8].x, activeHand[4].y - activeHand[8].y);
    var isPinchingNow = pinchDist < maxScale * 0.3 * (cfg.pinchSens || 1);
    if (!isPinchingNow) state.pinchReleased = true;

    var rawPt = activeHand[cfg.trackPt | 0];
    if (state.lastHandX === null || state.lastHandLabel !== activeLabel) {
      state.lastHandX = rawPt.x;
      state.lastHandY = rawPt.y;
      state.lastHandLabel = activeLabel;
    }

    var dx = rawPt.x - state.lastHandX;
    var dy = rawPt.y - state.lastHandY;
    if (!cfg.invX) dx *= -1;
    if (cfg.invY) dy *= -1;

    var zw = cfg.zone && cfg.zone.w ? cfg.zone.w : 1;
    var zh = cfg.zone && cfg.zone.h ? cfg.zone.h : 1;
    var gainX = (1 / zw) * window.innerWidth;
    var gainY = (1 / zh) * window.innerHeight;
    var sm = parseFloat(cfg.smooth) || 0.7;

    state.cx += dx * gainX * (1 / sm);
    state.cy += dy * gainY * (1 / sm);
    state.cx = Math.max(0, Math.min(window.innerWidth, state.cx));
    state.cy = Math.max(0, Math.min(window.innerHeight, state.cy));
    state.sx = state.sx * sm + state.cx * (1 - sm);
    state.sy = state.sy * sm + state.cy * (1 - sm);

    var wasPinch = state.isPinching;
    state.isPinching = isPinchingNow;
    var allowClick = !cfg.requirePalm || palmOpen;

    if (allowClick) interactAt(state.sx, state.sy, wasPinch, isPinchingNow);

    latest.hasHand = true;
    latest.sx = state.sx;
    latest.sy = state.sy;
    latest.isPinching = isPinchingNow;
    latest.allowClick = allowClick;
    latest.flip = flipCursor;

    state.lastHandX = rawPt.x;
    state.lastHandY = rawPt.y;

    if (cfg.showCam && ui && typeof drawConnectors === 'function') {
      var c = ui.canvas;
      var ctx = c.getContext('2d');
      c.width = ui.video.videoWidth || 640;
      c.height = ui.video.videoHeight || 480;
      ctx.clearRect(0, 0, c.width, c.height);
      drawConnectors(ctx, activeHand, HAND_CONNECTIONS, { color: '#00ff9d', lineWidth: 2 });
      drawLandmarks(ctx, activeHand, { color: '#fff', lineWidth: 1, radius: 2 });
    }
  }

  function renderLoop() {
    if (!ui) return;
    if (latest.hasHand) {
      ui.cursor.style.left = latest.sx + 'px';
      ui.cursor.style.top = latest.sy + 'px';
      ui.cursor.classList.toggle('flip', !!latest.flip);
      ui.cursor.classList.toggle('pinch', !!latest.isPinching);
      ui.cursor.classList.toggle('dim', !latest.allowClick);
      ui.cursor.style.display = 'block';
    } else {
      ui.cursor.classList.add('dim');
    }
    requestAnimationFrame(renderLoop);
  }

  function startCamera() {
    var size = RES_MAP[cfg.captureRes] || RES_MAP['480'];
    currentProcessSize = { w: size.w, h: size.h };
    if (ui.video.srcObject) {
      ui.video.srcObject.getTracks().forEach(function (t) { t.stop(); });
    }
    processCanvas = document.createElement('canvas');
    processCtx = processCanvas.getContext('2d');

    cameraInstance = new Camera(ui.video, {
      onFrame: async function () {
        if (cfg.dynamicRes) {
          if (processCanvas.width !== currentProcessSize.w || processCanvas.height !== currentProcessSize.h) {
            processCanvas.width = currentProcessSize.w;
            processCanvas.height = currentProcessSize.h;
          }
          processCtx.drawImage(ui.video, 0, 0, currentProcessSize.w, currentProcessSize.h);
          await hands.send({ image: processCanvas });
        } else {
          await hands.send({ image: ui.video });
        }
      },
      width: size.w,
      height: size.h
    });
    cameraInstance.start();
  }

  async function boot() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', boot);
      return;
    }
    cfg = loadCfg();
    state.cx = state.sx = window.innerWidth / 2;
    state.cy = state.sy = window.innerHeight / 2;

    ui = injectUI();
    if (cfg.showCam) ui.cam.classList.add('show');

    try {
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js');
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');
    } catch (e) {
      setBanner('AIM: failed to load MediaPipe');
      return;
    }

    hands = new Hands({
      locateFile: function (f) {
        return 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/' + f;
      }
    });
    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: cfg.modelComplexity | 0,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    hands.onResults(onResults);

    startCamera();
    requestAnimationFrame(renderLoop);

    window.addEventListener('storage', function (e) {
      if (e.key === CFG_KEY) {
        cfg = loadCfg();
        if (ui && ui.cam) ui.cam.classList.toggle('show', !!cfg.showCam);
      }
    });
    window.addEventListener('akari_aim_cfg_changed', function () {
      cfg = loadCfg();
      if (ui && ui.cam) ui.cam.classList.toggle('show', !!cfg.showCam);
    });

    global.AIMHandTracking = {
      reloadCfg: function () { cfg = loadCfg(); },
      getCfg: function () { return cfg; },
      setBanner: setBanner
    };
  }

  boot();
})(typeof window !== 'undefined' ? window : this);
