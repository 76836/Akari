loadscreen("(5th revision) Loading Akari's VRM...");

(function () {
  var SENTENCE_DISPLAY_TIME = 3000; // 3 seconds per sentence
  var IDLE_WAIT_TIME = 7000;       // 7 seconds between idle checks
  
  // Idle Percentages: 25% Stay, 15% Happy, 40% Neutral, 20% Confused

  // Resolve repo root from this script's URL so iframes work from /UI/, /settings/, etc.
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
  <style>.avatariframe { width:100%; height:100%; position:fixed; left:0; top:0; z-index:1; border:0; }</style>
  <iframe src="${root}engine/AkariNet-VRM-v2?modelUrl=https://76836.github.io/Akari/characters/akari/VRM/Akari-optimized.vrm&debug=false" class="avatariframe"></iframe>
  `;
  if (document.getElementById('avatar')) document.getElementById('avatar').innerHTML = thehtml;

  let lastValue = localStorage.getItem('emote');
  setInterval(() => {
    let current = localStorage.getItem('emote');
    if (current !== lastValue) {
      lastValue = current;
      window.dispatchEvent(new CustomEvent('akari_emote_update', { detail: current }));
    }
  }, 200);

  const middlemanLoader = document.createElement('script');
  middlemanLoader.type = 'module';
  middlemanLoader.textContent = `
    import analyzeEmotion from "https://76836.github.io/emotionEngine/engine.js";

    let idleInterval = null;
    let sequenceTimeout = null;
    const TRANSITIONS = { 'sad': 'confused', 'surprise': 'fear', 'anticipation': 'trust', 'angry': 'disgust' };

    function setEmote(emo) {
      localStorage.setItem('v2emote', emo);
      console.log("AkariNet emotionEngine new state: " + emo);
    }

    function startIdleLoop() {
      if (idleInterval) clearInterval(idleInterval);
      
      idleInterval = setInterval(() => {
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
      clearInterval(idleInterval);
      if (sequenceTimeout) clearTimeout(sequenceTimeout);

      const sentenceRegex = /[A-Z][^.]*\\./g;
      const matches = text.match(sentenceRegex) || [];

      if (matches.length === 0) return;

      for (let i = 0; i < matches.length; i++) {
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

    setEmote('love');
    startIdleLoop();
  `;
  document.body.appendChild(middlemanLoader);
})();

loadscreen("[OK] emotionEngine setup complete.");
