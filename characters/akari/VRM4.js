loadscreen("(5th revision) Loading Akari's VRM...");

(function () {
  var SENTENCE_DISPLAY_TIME = 3000;
  var IDLE_WAIT_TIME = 7000;
  var HIBERNATE_AFTER_MS = 60 * 1000;

  function akariRoot() {
    try {
      var scripts = document.getElementsByTagName('script');
      for (var i = scripts.length - 1; i >= 0; i--) {
        var src = scripts[i].src || '';
        if (/\/characters\/akari\/VRM4\.js/i.test(src)) {
          return src.replace(/characters\/akari\/VRM4\.js.*$/i, '');
        }
      }
    } catch (e) {}
    return './';
  }
  var root = akariRoot();

  var thehtml = `
  <style>.avatariframe { width:100%; height:100%; position:fixed; left:0; top:0; z-index:1; border:0; background:transparent !important; background-color:transparent !important; color-scheme:normal; }</style>
  <iframe src="${root}engine/AkariNet-VRM-v2?modelUrl=https://76836.github.io/Akari/characters/akari/VRM/Akari-optimized.vrm&debug=false" class="avatariframe" allowtransparency="true" style="background:transparent;background-color:transparent;"></iframe>
  `;
  if (document.getElementById('avatar')) document.getElementById('avatar').innerHTML = thehtml;

  let lastValue = localStorage.getItem('emote');
  setInterval(() => {
    let current = localStorage.getItem('emote');
    if (current !== lastValue) {
      lastValue = current;
      window.dispatchEvent(new CustomEvent('akari_emote_update', { detail: current }));
      noteActivity('emote-change');
    }
  }, 200);

  var hibernateTimer = null;
  var isHibernating = false;
  var lastLipsyncMouth = 0;

  function armHibernateTimer() {
    clearTimeout(hibernateTimer);
    hibernateTimer = setTimeout(function () {
      enterHibernate('inactivity');
    }, HIBERNATE_AFTER_MS);
  }

  function enterHibernate(source) {
    if (isHibernating) return;
    isHibernating = true;
    try { localStorage.setItem('v2emote', 'hibernate'); } catch (e) {}
    window.dispatchEvent(new CustomEvent('akari_vrm_hibernate', { detail: { source: source || 'inactivity' } }));
    console.log('AkariNet VRM hibernate (' + (source || 'inactivity') + ')');
  }

  function noteActivity(source) {
    if (isHibernating) {
      isHibernating = false;
      try {
        var cur = (localStorage.getItem('v2emote') || '').toLowerCase();
        if (cur === 'hibernate' || !cur) localStorage.setItem('v2emote', 'neutral');
      } catch (e) {}
      window.dispatchEvent(new CustomEvent('akari_vrm_wake', { detail: { source: source || 'activity' } }));
      console.log('AkariNet VRM wake (' + (source || 'activity') + ')');
    }
    armHibernateTimer();
  }

  function bindActivity(target, useCapture) {
    ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'keydown', 'wheel'].forEach(function (evt) {
      try {
        target.addEventListener(evt, function () { noteActivity(evt); }, { passive: true, capture: !!useCapture });
      } catch (e) {}
    });
  }
  bindActivity(document, true);
  bindActivity(window, false);

  window.addEventListener('akari:user-input', function () { noteActivity('user-input'); });
  window.addEventListener('user_input_received', function () { noteActivity('user_input_received'); });
  window.addEventListener('assistant_response', function () { noteActivity('assistant_response'); });
  window.addEventListener('screensaver_hidden', function () { noteActivity('screensaver_hidden'); });
  window.addEventListener('screensaver_shown', function () { enterHibernate('screensaver'); });

  // Same-origin iframe: attach after load so taps on the avatar wake her
  function attachIframeActivity() {
    try {
      var ifr = document.querySelector('#avatar iframe, iframe.avatariframe');
      if (!ifr || !ifr.contentWindow) return;
      bindActivity(ifr.contentWindow, false);
      try { if (ifr.contentDocument) bindActivity(ifr.contentDocument, true); } catch (e) {}
    } catch (e) {}
  }
  setTimeout(attachIframeActivity, 500);
  setTimeout(attachIframeActivity, 1500);
  setTimeout(attachIframeActivity, 3000);

  setInterval(function () {
    try {
      var raw = localStorage.getItem('akari:lipsync');
      if (!raw) return;
      var data = JSON.parse(raw);
      if (!data || typeof data.mouth !== 'number') return;
      if (Date.now() - (data.t || 0) > 500) return;
      if (data.mouth > 0.04) {
        lastLipsyncMouth = data.mouth;
        noteActivity('lipsync');
      }
    } catch (e) {}
  }, 200);

  armHibernateTimer();

  const middlemanLoader = document.createElement('script');
  middlemanLoader.type = 'module';
  middlemanLoader.textContent = `
    import analyzeEmotion from "https://76836.github.io/emotionEngine/engine.js";

    let idleInterval = null;
    let sequenceTimeout = null;
    const TRANSITIONS = { 'sad': 'confused', 'surprise': 'fear', 'anticipation': 'trust', 'angry': 'disgust' };

    function isHibernating() {
      try { return (localStorage.getItem('v2emote') || '').toLowerCase() === 'hibernate'; }
      catch (e) { return false; }
    }

    function setEmote(emo) {
      if (isHibernating() && emo !== 'hibernate' && emo !== 'neutral') {
        try { localStorage.setItem('v2emote', emo); } catch (e) {}
        return;
      }
      if (isHibernating() && emo === 'hibernate') return;
      localStorage.setItem('v2emote', emo);
      console.log("AkariNet emotionEngine new state: " + emo);
    }

    function startIdleLoop() {
      if (idleInterval) clearInterval(idleInterval);
      idleInterval = setInterval(() => {
        if (isHibernating()) return;
        const roll = Math.random() * 100;
        if (roll < 25) {
            console.log("AkariNet Idle: Roll " + roll.toFixed(1) + " (No change)");
        } else if (roll < 40) {
            setEmote('happy');
        } else if (roll < 80) {
            setEmote('neutral');
        } else {
            setEmote('confused');
        }
      }, ${IDLE_WAIT_TIME});
    }

    async function processSequence(text) {
      if (isHibernating()) return;
      clearInterval(idleInterval);
      if (sequenceTimeout) clearTimeout(sequenceTimeout);
      const sentenceRegex = /[A-Z][^.]*\\./g;
      const matches = text.match(sentenceRegex) || [];
      if (matches.length === 0) return;
      for (let i = 0; i < matches.length; i++) {
        if (isHibernating()) return;
        const emotion = analyzeEmotion(matches[i]).dominant;
        setEmote(emotion);
        await new Promise(resolve => setTimeout(resolve, ${SENTENCE_DISPLAY_TIME}));
        if (i === matches.length - 1) {
          if (TRANSITIONS[emotion]) {
            setEmote(TRANSITIONS[emotion]);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }
      startIdleLoop();
    }

    window.addEventListener('akari_emote_update', (event) => {
      processSequence(event.detail);
    });

    window.addEventListener('akari_vrm_wake', () => { startIdleLoop(); });
    window.addEventListener('akari_vrm_hibernate', () => {
      if (idleInterval) clearInterval(idleInterval);
      idleInterval = null;
    });

    setEmote('love');
    startIdleLoop();
  `;
  document.body.appendChild(middlemanLoader);
})();

loadscreen("[OK] emotionEngine setup complete.");
