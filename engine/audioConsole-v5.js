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
      if (window.loadscreen) window.loadscreen(p < 100 ? `[${p}%] ${msg}` : msg);
    } catch (_) {}
    try {
      localStorage.setItem('akari:ac-load', JSON.stringify({ p: p, msg: msg, t: Date.now() }));
    } catch (_) {}
  }

  // Status bar (reuse visual language of v4)
  let statusBar = null;
  let visualState = 'idle';
  let wakeResetTimer = null;

  function ensureBar() {
    if (statusBar) return statusBar;
    if (!document.getElementById('ac5-bar-style')) {
      const st = document.createElement('style');
      st.id = 'ac5-bar-style';
      st.textContent = `
        #audio-status-bar.ac5 {
          position: fixed; left: 0; right: 0; bottom: 0; height: 4px; z-index: 9997;
          pointer-events: none; opacity: 0; transition: opacity 0.2s;
          background: linear-gradient(90deg, #008b8b, #00e5ff, #008b8b);
          background-size: 200% 100%;
        }
        #audio-status-bar.ac5.active { opacity: 1; animation: ac5-flow 1.8s linear infinite; }
        #audio-status-bar.ac5.wake { height: 10px; animation-duration: 1.2s; }
        #audio-status-bar.ac5.listening { height: 6px; }
        #audio-status-bar.ac5.processing { height: 8px; animation-duration: 2.5s; }
        @keyframes ac5-flow { 0% { background-position: 0% 0; } 100% { background-position: 200% 0; } }
      `;
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
      wakeResetTimer = setTimeout(() => setVisualState('idle'), 6000);
    } else if (state === 'listening') bar.classList.add('listening');
    else if (state === 'processing') bar.classList.add('processing');
  }

  async function playWakeChime() {
    if (lsBool('ac5_ttsGreeting', false)) {
      // Spoken phrase path — leave to TTS elsewhere if wired; optional short delay
      return;
    }
    return new Promise((resolve) => {
      try {
        const a = new Audio('https://76836.github.io/Akari/characters/akari/Summon.mp3');
        a.volume = 1;
        const done = () => resolve();
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
        // bundled models under ACv5; empty uses package defaults
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

    // Per-engine optional overrides
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

  async function boot() {
    prog(5, 'Loading Audio Console v5…');
    const mod = await import(ACv5_BASE + 'audioConsole-5.0.0.js');
    const AudioConsole = mod.AudioConsole || mod.default;
    if (!AudioConsole) throw new Error('ACv5 module missing AudioConsole export');

    prog(25, 'Creating console…');
    const cfg = buildConfig();
    ac = new AudioConsole(cfg);

    ac.on('ready', () => {
      prog(100, 'Audio Console v5 ready');
      apStatus('Audio Console v5 ready', { busy: false, idle: true });
    });

    ac.on('speechDetected', (d) => {
      if (d && d.active) setVisualState('listening');
      try {
        window.dispatchEvent(
          new CustomEvent(d && d.active ? 'audioConsoleSpeechStart' : 'audioConsoleSpeechEnd')
        );
      } catch (_) {}
    });

    ac.on('wake', async (d) => {
      setVisualState('wake');
      notifyUserInput('wake-word');
      try {
        window.dispatchEvent(
          new CustomEvent('audioConsoleWakeSound', { detail: d })
        );
      } catch (_) {}
      apStatus('Wake: ' + ((d && d.keyword) || 'hey akari'), { busy: true });
      await playWakeChime();
      // Hold-for-reply policy waits for reply_done; chime end is not ASR gate in v5 the same way —
      // policy owns listen windows after wake.
    });

    ac.on('partial', (d) => {
      if (d && d.text) {
        try {
          window.dispatchEvent(
            new CustomEvent('audioConsolePartial', { detail: { text: d.text } })
          );
        } catch (_) {}
      }
    });

    ac.on('transcript', (d) => {
      setVisualState('processing');
      try {
        window.dispatchEvent(new CustomEvent('audioConsoleProcessing'));
      } catch (_) {}
      emitTranscript(d && d.text, { trigger: d && d.trigger, prompt: d && d.prompt });
      setTimeout(() => {
        setVisualState('idle');
        try {
          window.dispatchEvent(new CustomEvent('audioConsoleProcessingEnd'));
        } catch (_) {}
      }, 400);
    });

    ac.on('status', (d) => {
      if (!d || !d.type) return;
      if (d.type === 'waiting') {
        setVisualState('wake');
        apStatus('Waiting until reply finishes…', { busy: true });
      }
      if (d.type === 'listening') {
        setVisualState('listening');
        apStatus('Listening…', { busy: true });
      }
      if (d.type === 'hold-timeout' || d.type === 'cancelled') {
        setVisualState('idle');
        apStatus('Listen ended', { busy: false, idle: true });
      }
    });

    ac.on('error', (d) => {
      console.error('[ACv5]', d);
      try {
        window.dispatchEvent(
          new CustomEvent('audioConsoleError', { detail: d })
        );
      } catch (_) {}
    });

    // When Akari finishes speaking, release hold-for-reply / continued gate
    window.addEventListener('audioConsoleSpeechEnd', () => {
      try {
        if (ac && lsBool('ac5_holdForReply', true)) ac.signal('reply_done');
      } catch (_) {}
    });
    // Also listen for TTS-end hooks used elsewhere
    window.addEventListener('akari:tts-end', () => {
      try {
        if (ac && lsBool('ac5_holdForReply', true)) ac.signal('reply_done');
      } catch (_) {}
    });

    prog(40, 'Starting mic, wake, and transcribe heads…');
    await ac.start();
    started = true;
    prog(100, 'Audio Console v5 online');
    window.__ac5 = ac;
    window.__ac5Adapter = {
      cancel: () => ac && ac.cancel(),
      armManual: () => ac && ac.arm('manual'),
      signalReplyDone: () => ac && ac.signal('reply_done'),
      destroy: () => {
        try {
          ac && ac.destroy();
        } catch (_) {}
        ac = null;
        started = false;
      }
    };
  }

  // Manual mic button compatibility
  window.addEventListener('akari:manual-listen', () => {
    try {
      if (ac) ac.arm('manual');
    } catch (e) {
      console.warn('[ACv5] manual arm', e);
    }
  });

  boot().catch((e) => {
    console.error('[ACv5] boot failed', e);
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
