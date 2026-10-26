/**
 * AKARINET AUDIO CONSOLE — ADAPTER v5
 * Bridges ACv5 the same way the v4 adapter bridges ACv4:
 *  - load the package as a real ES module (injected type=module script)
 *  - map package events onto Akari window events + respond()
 *
 * localStorage: ac5_* only (v4 keeps ac41_*).
 * selectedWakeScript = ./engine/audioConsole-v5.js
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
        new CustomEvent('akari:autopilot', {
          detail: Object.assign({ text: text }, opts || {})
        })
      );
    } catch (_) {}
  }

  function prog(p, msg) {
    try {
      if (window.loadscreen) window.loadscreen(p < 100 ? '[' + p + '%] ' + msg : msg);
    } catch (_) {}
    try {
      localStorage.setItem('akari:ac-load', JSON.stringify({ p: p, msg: msg, t: Date.now() }));
    } catch (_) {}
  }

  function pulseVrmWake(source) {
    try {
      const cur = (localStorage.getItem('v2emote') || '').toLowerCase();
      if (cur === 'hibernate' || !cur) localStorage.setItem('v2emote', 'neutral');
      localStorage.setItem('akari:vrm-wake', String(Date.now()) + '|' + (source || 'voice'));
    } catch (_) {}
    try {
      window.dispatchEvent(
        new CustomEvent('akari:user-input', { detail: { source: source || 'audioConsole-v5' } })
      );
    } catch (_) {}
  }

  // ---- status bar (parity with v4 visuals) ----
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
    bar.classList.remove('active', 'listening', 'wake', 'processing', 'result');
    if (state === 'idle') return;
    bar.classList.add('active');
    if (state === 'wake') {
      bar.classList.add('wake');
      wakeResetTimer = setTimeout(function () {
        if (visualState === 'wake') setVisualState('idle');
      }, 8000);
    } else if (state === 'listening') bar.classList.add('listening');
    else if (state === 'processing') bar.classList.add('processing');
    else if (state === 'result') bar.classList.add('result');
  }

  const idleHooks = []; // run once when all of Akari's queued speech has ended
  const WAKE_GREETINGS = ["what's up?", 'hey', 'hello', 'hi', 'yeah?'];

  // Resolves when the wake chime or spoken greeting has finished playing (event driven,
  // with a safety timeout so a stalled audio element can never leave the console deaf).
  function playWakeSound() {
    return new Promise(function (resolve) {
      let done = false;
      let guard = null;
      const finish = function () {
        if (done) return;
        done = true;
        clearTimeout(guard);
        resolve();
      };
      const greet = lsBool('ac5_ttsGreeting', false) && typeof window.speak === 'function';
      guard = setTimeout(finish, greet ? 15000 : 6000);
      if (greet) {
        const phrase = WAKE_GREETINGS[Math.floor(Math.random() * WAKE_GREETINGS.length)];
        // wait for ALL queued speech to end (a stale tts-end from an earlier sentence must not count)
        installSpeakTracking();
        idleHooks.push(finish);
        try { window.speak(phrase); } catch (e) {
          console.warn('[ACv5] greeting failed', e);
          finish();
        }
        return;
      }
      try {
        const a = new Audio('https://76836.github.io/Akari/characters/akari/Summon.mp3');
        a.volume = 1;
        a.onended = finish;
        a.onerror = finish;
        a.play().catch(finish);
      } catch (_) {
        finish();
      }
    });
  }

  /**
   * Split policy, inline so the adapter does not depend on a policy file being deployed.
   * - wake route holds (hold_until: reply_done) while the chime / greeting plays, so the
   *   chime or "what's up?" is never transcribed; this adapter releases it when it ends.
   * - continued route always holds until Akari has finished speaking her reply.
   */
  function buildPolicy(holdWake) {
    const hold = function (ms) {
      return ['      hold_until: reply_done', '      hold_timeout_ms: ' + ms];
    };
    return [
      'version: "5.0"',
      'name: "Akari adapter policy"',
      'globals:',
      '  silence_timeout_ms: 1600',
      '  default_listen_ms: 12000',
      'routes:',
      '  - name: always_cache',
      '    to: cache',
      '    when: always',
      '  - name: always_wake',
      '    to: wake',
      '    when: always',
      '  - name: post_wake_transcribe',
      '    to: transcribe',
      '    when:',
      '      after_event: wake'
    ]
      .concat(holdWake ? hold(20000) : [])
      .concat([
        '      and: voice_active',
        '      until:',
        '        silence: 1600',
        '        timeout_ms: 12000',
        '    lead_in_ms: 320',
        '    settle_ms: 400',
        '    flags:',
        '      hold_until_okay: true',
        '      require_wake: true',
        '  - name: continued_listen',
        '    to: transcribe',
        '    when:',
        '      after_event: continued'
      ])
      .concat(hold(90000))
      .concat([
        '      and: voice_active',
        '      until:',
        '        silence: 1600',
        '        timeout_ms: 7000',
        '    lead_in_ms: 320',
        '    flags:',
        '      hold_until_okay: true',
        '  - name: manual_listen',
        '    to: transcribe',
        '    when:',
        '      after_event: manual',
        '      and: voice_active',
        '      until:',
        '        silence: 1600',
        '        timeout_ms: 12000',
        '    lead_in_ms: 320',
        '    flags:',
        '      hold_until_okay: true',
        'events:',
        '  wake:',
        '    source: wake',
        '  continued:',
        '    source: bootstrapper',
        '  manual:',
        '    source: bootstrapper',
        '  reply_done:',
        '    source: bootstrapper',
        'public:',
        '  - speech_detected',
        '  - wake',
        '  - transcript',
        '  - partial',
        ''
      ])
      .join('\n');
  }

  function buildConfig() {
    const engine = ls('ac5_transcribeEngine', 'NeMo');
    const threshold = lsNum('ac5_wakeThreshold', 0.5);
    // Wait for the chime / greeting before listening (default ON: otherwise it is transcribed).
    const holdWake = lsBool('ac5_holdForReply', true);
    const continued = lsBool('ac5_continuedConversation', false);
    const detail = lsNum('ac5_promptDetail', 0);
    const debug = lsBool('ac5_debug', false);

    const heads = {
      read: { deviceIndex: 0 },
      cache: { windowMs: lsNum('ac5_cacheWindowMs', 120000) },
      wake: { threshold: threshold },
      transcribe: {
        engine: engine,
        prompt: detail > 0 ? { detail: detail } : false
      },
      record: {},
      split: { policy: buildPolicy(holdWake) }
    };

    const wakeModel = ls('ac5_wakeModelUrl', '');
    if (wakeModel) heads.wake.keywords = [wakeModel];

    const voskUrl = ls('ac5_voskModelUrl', '');
    if (engine === 'Vosk' && voskUrl) heads.transcribe.modelUrl = voskUrl;

    return {
      debug: debug,
      continuedConversation: {
        enabled: continued,
        listenMs: lsNum('ac5_continuedMs', 7000)
      },
      heads: heads
    };
  }

  let ac = null;
  let ready = false;

  // ac.signal / ac.arm return promises: never let a refusal become an unhandled rejection.
  function safeSignal(name) {
    if (!ac || !ready) return false;
    ac.signal(name).catch(function (e) {
      console.warn('[ACv5] signal(' + name + '):', e && e.message ? e.message : e);
    });
    return true;
  }

  function safeArm(name, opts) {
    if (!ac || !ready) return false;
    ac.arm(name, opts || {}).catch(function (e) {
      console.warn('[ACv5] arm(' + name + '):', e && e.message ? e.message : e);
      setVisualState('idle');
    });
    return true;
  }

  // ---- waiting for the reply (hold_until: reply_done) ----
  let waiting = null; // { route, token }
  let waitToken = 0;

  function onWaiting(route) {
    const token = ++waitToken;
    waiting = { route: route, token: token };
    setVisualState('wake');
    apStatus('Waiting…', { busy: true });
    if (route === 'post_wake_transcribe') {
      // chime or spoken greeting, then open the mic for the command
      playWakeSound().then(function () {
        if (waiting && waiting.token === token) safeSignal('reply_done');
      });
    }
    // continued_listen: released when Akari's speech goes idle (see speak tracking below)
  }

  function clearWaiting() {
    waiting = null;
    waitToken++;
  }

  // Same consumer path as v4's audioConsoleResult handler
  function handleTranscript(text, meta) {
    const t = (text || '').trim();
    if (!t) return;
    console.log('[ACv5] transcript', t, meta || '');
    setVisualState('result');
    try {
      window.dispatchEvent(
        new CustomEvent('transcriptionComplete', {
          detail: Object.assign({ text: t, transcript: t }, meta || {})
        })
      );
    } catch (_) {}
    try {
      window.dispatchEvent(new CustomEvent('audioConsoleResult', { detail: { text: t } }));
    } catch (_) {}
    if (window.app) window.app.isSilentMode = false;
    if (window.bubble_incoming) window.bubble_incoming(t);
    if (window.app && window.app.ui && window.app.ui.setTyping) window.app.ui.setTyping('Akari');
    if (window.respond) window.respond(t);
    pulseVrmWake('audioConsole-v5-result');
    setTimeout(function () {
      if (visualState === 'result') setVisualState('idle');
    }, 1200);
  }

  function wireConsole(instance) {
    ac = instance;

    ac.on('ready', function (d) {
      ready = true;
      console.log('[ACv5] ready', d);
      prog(100, 'Audio Console v5 ready');
      apStatus('Audio Console v5 ready — say Hey Akari', { busy: false, idle: true });
    });

    ac.on('speechDetected', function (d) {
      if (d && d.active) {
        setVisualState('listening');
        try { window.dispatchEvent(new CustomEvent('audioConsoleSpeechStart')); } catch (_) {}
      }
    });

    ac.on('wake', function (d) {
      console.log('[ACv5] wake', d);
      setVisualState('wake');
      pulseVrmWake('audioConsole-wakesound');
      try {
        window.dispatchEvent(new CustomEvent('audioConsoleWakeSound', { detail: d }));
      } catch (_) {}
      apStatus(
        'Wake: ' + ((d && d.keyword) || 'hey akari') +
          (d && d.score != null ? ' (' + Number(d.score).toFixed(2) + ')' : ''),
        { busy: true }
      );
    });

    ac.on('partial', function (d) {
      if (d && d.text) {
        try {
          window.dispatchEvent(new CustomEvent('audioConsolePartial', { detail: { text: d.text } }));
        } catch (_) {}
      }
    });

    ac.on('transcript', function (d) {
      try { window.dispatchEvent(new CustomEvent('audioConsoleProcessing')); } catch (_) {}
      setVisualState('processing');
      handleTranscript(d && d.text, { trigger: d && d.trigger, prompt: d && d.prompt });
      try { window.dispatchEvent(new CustomEvent('audioConsoleProcessingEnd')); } catch (_) {}
    });

    ac.on('status', function (d) {
      if (!d || !d.type || d.type === 'scores') return;
      console.log('[ACv5] status', d.type, d);
      if (d.type === 'waiting') onWaiting(d.route);
      if (d.type === 'listening') {
        clearWaiting();
        setVisualState('listening');
        apStatus('Listening…', { busy: true });
      }
      if (d.type === 'hold-timeout' || d.type === 'cancelled' || d.type === 'hold-superseded') {
        clearWaiting();
        if (d.type !== 'hold-superseded') {
          setVisualState('idle');
          apStatus('Listen ended', { busy: false, idle: true });
        }
      }
    });

    ac.on('error', function (d) {
      console.error('[ACv5] error', d);
      try {
        window.dispatchEvent(new CustomEvent('audioConsoleError', { detail: d }));
      } catch (_) {}
    });
  }

  // Track Akari's speech: a reply is several speak() calls, so the continued-conversation hold
  // is only released when ALL queued speech has ended (debounced). Each akari:tts-end retires
  // exactly one pending speak(), so a stale end from earlier speech cannot end a newer one.
  const pendingSpeech = []; // one token per speak() not yet ended
  let idleTimer = null;

  function onSpeechIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () {
      if (pendingSpeech.length === 0 && waiting && waiting.route === 'continued_listen') safeSignal('reply_done');
    }, 700);
  }

  function speechRetired() {
    if (pendingSpeech.length) return;
    idleHooks.splice(0).forEach(function (h) { try { h(); } catch (_) {} });
    onSpeechIdle();
  }

  window.addEventListener('akari:tts-end', function () {
    const tok = pendingSpeech.shift();
    if (tok) clearTimeout(tok.timer);
    speechRetired();
  });

  // The app's speak() falls back to the browser's speechSynthesis, which never fires
  // akari:tts-end; synthesise it (only in that case, so Piper & co. are not cut short).
  function usesWebSpeech() {
    return !(window.tts && typeof window.tts.speak === 'function') &&
      typeof window.speakt5 !== 'function' && 'speechSynthesis' in window;
  }

  function watchWebSpeech() {
    let n = 0;
    const iv = setInterval(function () {
      const ss = window.speechSynthesis;
      n++;
      if (n > 3 && !ss.speaking && !ss.pending) {
        clearInterval(iv);
        try { window.dispatchEvent(new CustomEvent('akari:tts-end', { detail: { source: 'speechSynthesis' } })); } catch (_) {}
      } else if (n > 600) clearInterval(iv);
    }, 200);
  }

  function installSpeakTracking() {
    if (typeof window.speak !== 'function') return false;
    if (window.speak.__ac5Wrapped) return true;
    const orig = window.speak;
    window.speak = function ac5SpeakWrapped() {
      clearTimeout(idleTimer);
      const tok = {};
      tok.timer = setTimeout(function () {
        // dead TTS engine: do not stay busy forever
        const i = pendingSpeech.indexOf(tok);
        if (i >= 0) { pendingSpeech.splice(i, 1); speechRetired(); }
      }, 120000);
      pendingSpeech.push(tok);
      const ret = orig.apply(this, arguments);
      if (usesWebSpeech()) watchWebSpeech();
      return ret;
    };
    window.speak.__ac5Wrapped = true;
    return true;
  }
  if (!installSpeakTracking()) {
    let tries = 0;
    const t = setInterval(function () {
      if (installSpeakTracking() || ++tries > 40) clearInterval(t);
    }, 500);
  }

  window.addEventListener('akari:manual-listen', function () {
    safeArm('manual');
  });

  /**
   * Load pattern matches v4 adapter: inject type=module so dynamic import
   * runs in a real module scope (same as the working ACv5 demo page).
   */
  function boot() {
    prog(5, 'Loading Audio Console v5…');
    const cfg = buildConfig();
    const cfgJson = JSON.stringify(cfg);

    const script = document.createElement('script');
    script.type = 'module';
    script.textContent = `
      const BASE = ${JSON.stringify(ACv5_BASE)};
      const cfg = ${cfgJson};
      const _prog = (p, t) => window.dispatchEvent(new CustomEvent('audioConsoleProgress', { detail: { percent: p, text: t } }));
      try {
        _prog(15, 'Importing ACv5 module…');
        const mod = await import(BASE + 'audioConsole-5.0.0.js');
        const AudioConsole = mod.AudioConsole || mod.default;
        if (!AudioConsole) throw new Error('ACv5 missing AudioConsole export');
        _prog(30, 'Creating console…');
        const ac = new AudioConsole(cfg);
        window.__ac5Instance = ac;
        window.dispatchEvent(new CustomEvent('ac5:created'));
        _prog(45, 'Starting heads (mic, wake, transcribe)…');
        await ac.start();
        _prog(100, 'ACv5 online');
        window.dispatchEvent(new CustomEvent('ac5:started'));
      } catch (e) {
        console.error('[ACv5] module boot failed', e);
        window.dispatchEvent(new CustomEvent('ac5:failed', { detail: e && e.message ? e.message : String(e) }));
      }
    `;

    window.addEventListener(
      'ac5:created',
      function () {
        if (window.__ac5Instance) wireConsole(window.__ac5Instance);
      },
      { once: true }
    );

    window.addEventListener(
      'ac5:started',
      function () {
        ready = true;
        window.__ac5 = window.__ac5Instance;
        window.__ac5Adapter = {
          ready: function () { return !!(ac && ready); },
          cancel: function () {
            if (!ac || !ready) return;
            try { ac.cancel(); } catch (e) { console.warn('[ACv5] cancel', e); }
          },
          armManual: function () { return safeArm('manual'); },
          signalReplyDone: function () { return safeSignal('reply_done'); },
          destroy: function () {
            try { if (ac) ac.destroy(); } catch (_) {}
            ac = null;
            ready = false;
          }
        };
        console.log('[ACv5] adapter online — say Hey Akari');
        apStatus('Audio Console v5 online', { busy: false, idle: true });
      },
      { once: true }
    );

    window.addEventListener(
      'ac5:failed',
      function (e) {
        prog(100, 'ACv5 failed: ' + (e.detail || 'unknown'));
        apStatus('ACv5 failed: ' + (e.detail || ''), { busy: false });
      },
      { once: true }
    );

    window.addEventListener('audioConsoleProgress', function (e) {
      const d = e.detail || {};
      if (typeof d.percent === 'number') prog(d.percent, d.text || 'Loading…');
    });

    document.head.appendChild(script);
  }

  boot();
})();
