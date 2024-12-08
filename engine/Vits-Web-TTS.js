say('Vits Web TTS is running locally (v1.0 experimental release)');
function loadTTS() {
  const script = document.createElement('script');
  script.type = 'module';
  script.textContent = `

      import * as tts from 'https://cdn.jsdelivr.net/npm/@diffusionstudio/vits-web@1.0.3/+esm';
      

      await tts.download('en_US-hfc_female-medium', (progress) => {
  console.log(\`Downloading \${progress.url} - \${Math.round(progress.loaded * 100 / progress.total)}%\`);
  window.TTSloadmsg(\`Downloading \${progress.url} - \${Math.round(progress.loaded * 100 / progress.total)}%\`);
});

      // Define the speak function with split utterances
      async function speak(text) {

          window.TTSloadmsg('Started talking...');
const wav = await tts.predict({
  text: text,
  voiceId: 'en_US-hfc_female-medium',
});

const audio = new Audio();
audio.src = URL.createObjectURL(wav);
audio.play();


          }
          window.TTSloadmsg('Finished talking');
      }
      
      // Stop speech generation and playback
      function interrupt() {
          if (window.audioContext) {
              window.audioContext.close();
              window.audioContext = null;
          }
          stopFlag = true; // Set stop flag to interrupt the speak loop
      }

      // Expose the functions to the global scope
      window.speakTTS = speak;
      window.interruptTTS = interrupt;
      window.setTTSRate = (rate) => { t5rate = rate; };

  `;
  document.body.appendChild(script);
}
loadt5s();

// Functions to use externally
window.TTSemote = emote;

window.TTSloadmsg = loadscreen;

function speak(text) {
  window.speakTTS(text);
}

function stopSpeech() {
  window.interruptTTS();
}

function setPlaybackRate(rate) {
  window.setTTSRate(rate);
}
