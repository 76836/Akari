loadscreen("(5th revision) Loading Akari's VRM...");
//this is a temporary script, remind me to add a vrm model selector in settings so VRM4.js can just read the model prefs on init as opposed to having a script for every model.
(function () {
  var SENTENCE_DISPLAY_TIME = 3000; // 3 seconds per sentence
  var IDLE_WAIT_TIME = 7000;       // 7 seconds between idle checks
  
  // Idle Percentages: 25% Stay, 15% Happy, 40% Neutral, 20% Confused

  var thehtml = `
  <style>.avatariframe { width:100%; height:100%; position:fixed; left:0; top:0; z-index:1; border:0; }</style>
  <iframe src="./engine/AkariNet-VRM?modelUrl=https://76836.github.io/Akari/characters/7950737695103985735.vrm&debug=false" class="avatariframe"></iframe>
  `;//weird that it seemed to work last time with the .html extension, i wonder if i'm breaking it now...
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
        
        // 25% Chance: Do nothing (0 - 25)
        if (roll < 25) {
            console.log("AkariNet Idle: Roll " + roll.toFixed(1) + " (No change)");
        } 
        // 15% Chance: Happy (25 - 40)
        else if (roll < 40) {
            setEmote('happy');
        } 
        // 40% Chance: Neutral (40 - 80)
        else if (roll < 80) {
            setEmote('neutral');
        } 
        // 20% Chance: Confused (80 - 100)
        else {
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

    // Startup sequence
    setEmote('love');
    startIdleLoop();
  `;
  document.body.appendChild(middlemanLoader);
})();

loadscreen("[OK] emotionEngine setup complete.");
