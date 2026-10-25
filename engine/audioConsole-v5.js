/**
 * AKARINET AUDIO CONSOLE — ADAPTER v5
 * Bridges AkariNet-AudioConsole ACv5 into the Akari PWA UI.
 * Uses ac5_* localStorage keys (separate from ac41_* v4 keys).
 * selectedWakeScript = ./engine/audioConsole-v5.js selects this adapter.
 */
(function () {
  'use strict';

  const ACv5_BASE = 'https://76836.github.io/AkariNet-AudioConsole/ACv5/';
  const ls = (k, d) => {
    const v = localStorage.getItem(k);
    return v == null || v === '' ? d : v;
  };
  const lsBool = (k, d) => {
    const v = localStorage.getItem(k);
    if (v == null || v === '') return d;
    return v === 'true';
  };
  const lsNum = (k, d) => {
    const v = parseFloat(localStorage.getItem(k) || '');
    return isNaN(v) ? d : v;
  };

  function apStatus(text, opts) {
    try {
      window.dispatchEvent(
        new CustomEvent('akari:autopilot', { detail: Object.assign({ text: text }, opts || {}) })
      );
    } catch (_) {}
  }

  function notifyUserInput(source, value) {
    try {
      const cur = (localStorage.getItem('v2emote') || '').toLowerCase();
      if (cur === 'hibernate' || !cur) localStorage.setItem('v2emote', 'neutral');
      localStorage.setItem('akari:vrm-wake', String(Date.now()) + '|' + (source || 'voice'));
    } catch (_) {}
    try {
      window.dispatchEvent(
        new CustomEvent('akari:user-input', {
          detail: { source: source || 'audioConsole-v5', value: value }
        })
      );
    } catch (_) {}
  }

  function emitTranscript(text, meta) {
    const t = (text || '').trim();
    if (!t) return;
    try {
      window.dispatchEvent(
        new CustomEvent('transcriptionComplete', {
          detail: Object.assign({ text: t, transcript: t }, meta || {})
        })
      );
    } catch (_) {}
    try {
      window.dispatchEvent(
        new CustomEvent('audioConsoleResult', { detail: { text: t } })
      );
    } catch (_) {}
    notifyUserInput('audioConsole-v5', t);
  }

  function prog(p, msg) {
    try {
      if (window.loadscreen) window.loadscreen(p < 100 ? '[' + p + '%] ' + msg : msg);
    } catch (_) {}
    try {
      localStorage.setItem('akari:ac-load', JSON.stringify({ p: p, msg: msg, t: Date.now() }));
    } catch (_) {}
  }

  let statusBar = null;
  let visualState = 'idle';
  let wakeResetTimer = null;

  function ensureBar() {
    if (statusBar) return statusBar;
    if (!document.getElementById('ac5-bar-style')) {
      const st = document.createElement('style');
      st.id = 'ac5-bar-style';
      st.textContent =
        '#audio-status-bar.ac5{position:fixed;left:0;right:0;bottom:0;height:4px;z-index:9997;pointer-events:none;opacity:0;transition:opacity .2s;' +
        'background:linear-gradient(90deg,#008b8b,#00e5ff,#008b8b);background-size:200% 100%}' +
        '#audio-status-bar.ac5.active{opacity:1;animation:ac5-flow 1.8s linear infinite}' +
        '#audio-status-bar.ac5.wake{height:10px;animation-duration:1.2s}' +
        '#audio-status-bar.ac5.listening{height:6px}' +
        '#audio-status-bar.ac5.processing{height:8px;animation-duration:2.5s}' +
        '@keyframes ac5-flow{0%{background-position:0% 0}100%{background-position:200% 0}}';
      document.head.appendChild(st);
    }
    statusBar = document.getElementById('audio-status-bar');
    if (!statusBar) {
      statusBar = document.createElement('div');
      statusBar.id = 'audio-status-bar';
      document.body.appendChild(statusBar);
    }
    statusBar.classList.add('ac5');
    return statusBar;
  }

  function setVisualState(state) {
    const bar = ensureBar();
    if (wakeResetTimer && state !== 'wake') {
      clearTimeout(wakeResetTimer);
      wakeResetTimer = null;
    }
    visualState = state;
    bar.classList.remove('active', 'listening', 'wake', 'processing');
    if (state === 'idle') return;
    bar.classList.add('active');
    if (state === 'wake') {
      bar.classList.add('wake');
      wakeResetTimer = setTimeout(function () { setVisualState('idle'); }, 6000);
    } else if (state === 'listening') bar.classList.add('listening');
    else if (state === 'processing') bar.classList.add('processing');
  }

  async function playWakeChime() {
    if (lsBool('ac5_ttsGreeting', false)) return;
    return new Promise(function (resolve) {
      try {
        const a = new Audio('https://76836.github.io/Akari/characters/akari/Summon.mp3');
        a.volume = 1;
        const done = function () { resolve(); };
        a.onended = done;
        a.onerror = done;
        a.play().catch(done);
      } catch (_) {
        resolve();
      }
    });
  }

  function buildConfig() {
    const engine = ls('ac5_transcribeEngine', 'NeMo');
    const threshold = lsNum('ac5_wakeThreshold', 0.5);
    const hold = lsBool('ac5_holdForReply', true);
    const continued = lsBool('ac5_continuedConversation', false);
    const detail = lsNum('ac5_promptDetail', 0);
    const debug = lsBool('ac5_debug', false);

    const heads = {
      cache: { windowMs: lsNum('ac5_cacheWindowMs', 120000) },
      wake: {
        threshold: threshold,
        modelUrl: ls('ac5_wakeModelUrl', '') || undefined
      },
      transcribe: {
        engine: engine,
        prompt: detail > 0 ? { detail: detail } : false
      },
      record: {}
    };

    if (hold || continued) {
      heads.split = {
        policy: { url: ACv5_BASE + 'policy/hold-for-reply.yaml' }
      };
    }

    if (engine === 'Vosk' && ls('ac5_voskModelUrl', '')) {
      heads.transcribe.modelUrl = ls('ac5_voskModelUrl', '');
    }

    return {
      debug: debug,
      public: ['ready', 'speechDetected', 'wake', 'transcript', 'partial', 'status', 'error'],
      heads: heads
    };
  }

  let ac = null;
  let started = false;
  let holdActive = false; // true after wake while waiting for assistant reply_done

  function safeSignal(name) {
    if (!ac || !started) return false;
    try {
      ac.signal(name);
      return true;
    } catch (e) {
      // Expected when nothing is waiting (idle, already listening, busy)
      if (lsBool('ac5_debug', false)) console.warn('[ACv5] signal(' + name + '):', e && e.message ? e.message : e);
      return false;
    }
  }

  function safeArm(name, opts) {
    if (!ac || !started) return false;
    try {
      ac.arm(name, opts || {});
      return true;
    } catch (e) {
      if (lsBool('ac5_debug', false)) console.warn('[ACv5] arm(' + name + '):', e && e.message ? e.message : e);
      return false;
    }
  }

  function releaseHold(reason) {
    if (!holdActive && !lsBool('ac5_holdForReply', true)) return;
    if (!started) return;
    const ok = safeSignal('reply_done');
    if (ok) holdActive = false;
    if (lsBool('ac5_debug', false)) console.log('[ACv5] releaseHold', reason, ok);
  }

  async function boot() {
    prog(5, 'Loading Audio Console v5…');
    const mod = await import(ACv5_BASE + 'audioConsole-5.0.0.js');
    const AudioConsole = mod.AudioConsole || mod.default;
    if (!AudioConsole) throw new Error('ACv5 module missing AudioConsole export');

    prog(25, 'Creating console…');
    const cfg = buildConfig();
    ac = new AudioConsole(cfg);

    ac.on('ready', function () {
      prog(100, 'Audio Console v5 ready');
      apStatus('Audio Console v5 ready', { busy: false, idle: true });
    });

    ac.on('speechDetected', function (d) {
      if (!started) return;
      if (d && d.active) {
        setVisualState('listening');
        try { window.dispatchEvent(new CustomEvent('audioConsoleSpeechStart')); } catch (_) {}
      } else {
        // User speech ended — do NOT signal reply_done (that is for assistant TTS end).
        try { window.dispatchEvent(new CustomEvent('audioConsoleUserSpeechEnd')); } catch (_) {}
      }
    });

    ac.on('wake', async function (d) {
      if (!started) return;
      setVisualState('wake');
      holdActive = lsBool('ac5_holdForReply', true) || lsBool('ac5_continuedConversation', false);
      notifyUserInput('wake-word');
      try {
        window.dispatchEvent(new CustomEvent('audioConsoleWakeSound', { detail: d }));
      } catch (_) {}
      apStatus('Wake: ' + ((d && d.keyword) || 'hey akari'), { busy: true });
      await playWakeChime();
    });

    ac.on('partial', function (d) {
      if (!started || !d || !d.text) return;
      try {
        window.dispatchEvent(new CustomEvent('audioConsolePartial', { detail: { text: d.text } }));
      } catch (_) {}
    });

    ac.on('transcript', function (d) {
      if (!started) return;
      setVisualState('processing');
      try { window.dispatchEvent(new CustomEvent('audioConsoleProcessing')); } catch (_) {}
      emitTranscript(d && d.text, { trigger: d && d.trigger, prompt: d && d.prompt });
      setTimeout(function () {
        setVisualState('idle');
        try { window.dispatchEvent(new CustomEvent('audioConsoleProcessingEnd')); } catch (_) {}
      }, 400);
    });

    ac.on('status', function (d) {
      if (!started || !d || !d.type) return;
      if (d.type === 'waiting') {
        holdActive = true;
        setVisualState('wake');
        apStatus('Waiting until reply finishes…', { busy: true });
      }
      if (d.type === 'listening') {
        setVisualState('listening');
        apStatus('Listening…', { busy: true });
      }
      if (d.type === 'hold-timeout' || d.type === 'cancelled') {
        holdActive = false;
        setVisualState('idle');
        apStatus('Listen ended', { busy: false, idle: true });
      }
    });

    ac.on('error', function (d) {
      console.error('[ACv5]', d);
      try {
        window.dispatchEvent(new CustomEvent('audioConsoleError', { detail: d }));
      } catch (_) {}
    });

    // Hold-for-reply: only release when the *assistant* finishes speaking, never on user VAD.
    window.addEventListener('akari:tts-end', function () { releaseHold('akari:tts-end'); });
    window.addEventListener('audioConsoleSpeechEnd', function () { releaseHold('audioConsoleSpeechEnd'); });
    // Some TTS scripts use speechSynthesis events without our custom names
    try {
      if (window.speechSynthesis) {
        // no global end event — rely on TTS scripts
      }
    } catch (_) {}

    prog(40, 'Starting mic, wake, and transcribe heads…');
    await ac.start();
    started = true;
    prog(100, 'Audio Console v5 online');
    apStatus('Audio Console v5 online', { busy: false, idle: true });

    window.__ac5 = ac;
    window.__ac5Adapter = {
      ready: function () { return !!(ac && started); },
      cancel: function () {
        if (!ac || !started) return;
        try { ac.cancel(); } catch (e) { console.warn('[ACv5] cancel', e); }
        holdActive = false;
      },
      armManual: function () {
        return safeArm('manual');
      },
      signalReplyDone: function () {
        return releaseHold('api');
      },
      destroy: function () {
        try { if (ac) ac.destroy(); } catch (_) {}
        ac = null;
        started = false;
        holdActive = false;
      }
    };
  }

  window.addEventListener('akari:manual-listen', function () {
    if (!started) {
      console.warn('[ACv5] manual listen ignored — console not ready yet');
      return;
    }
    safeArm('manual');
  });

  boot().catch(function (e) {
    console.error('[ACv5] boot failed', e);
    started = false;
    prog(100, 'ACv5 failed: ' + (e && e.message ? e.message : String(e)));
    try {
      window.dispatchEvent(
        new CustomEvent('audioConsoleError', {
          detail: e && e.message ? e.message : String(e)
        })
      );
    } catch (_) {}
  });
})();
