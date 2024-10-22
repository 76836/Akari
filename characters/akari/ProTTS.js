say('Akari speecht5 v0.1 active');
function loadt5s() {
  const script = document.createElement('script');
  script.type = 'module';
  script.textContent = `

      import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers';

      // Create TTS pipeline
      let synthesizer;
      (async function initializeSynthesizer() {
          synthesizer = await pipeline('text-to-speech', '/Xenova/speecht5_tts', { quantized: false });
      })();

      // Playback rate
      let t5rate = 1.2;
      let stopFlag = false;

      // Split text into utterances of up to 60 characters, prioritizing pauses
      function splitText(text) {
          const maxLength = 60;
          const utterances = [];
          let currentUtterance = '';

          text.split(/(?<=[.,!?])|\\s+/).forEach(word => {
              if ((currentUtterance + word).length <= maxLength) {
                  currentUtterance += (currentUtterance.length ? ' ' : '') + word;
              } else {
                  utterances.push(currentUtterance);
                  currentUtterance = word;
              }
          });
          if (currentUtterance) {
              utterances.push(currentUtterance);
          }
          return utterances;
      }

      // Define the speak function with split utterances
      async function speak(text) {
          if (!synthesizer) {
              console.error('Synthesizer is not initialized yet.');
              return;
          }
          const utterances = splitText(text);

          for (let i = 0; i < utterances.length; i++) {
              if (stopFlag) {
                  stopFlag = false; // Reset stop flag
                  return; // Stop playing further
              }

              // Generate speech for the current utterance
              const speaker_embeddings = './new_embeddings.bin';
              const result = await synthesizer(utterances[i], { speaker_embeddings });

              // Create an AudioContext if one does not already exist
              if (!window.audioContext) {
                  window.audioContext = new (window.AudioContext || window.webkitAudioContext)();
              }

              // Create an AudioBuffer to store the audio data
              const buffer = window.audioContext.createBuffer(1, result.audio.length, result.sampling_rate);
              const channelData = buffer.getChannelData(0);
              channelData.set(result.audio);

              // Create a buffer source and play the buffer
              const source = window.audioContext.createBufferSource();
              source.buffer = buffer;
              source.playbackRate.value = t5rate; // Set playback rate
              source.connect(window.audioContext.destination);

              // Play the buffer
              source.start();

              // Wait for the current utterance to finish playing before continuing
              await new Promise(resolve => source.onended = resolve);
          }
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
      window.speakt5 = speak;
      window.interruptt5 = interrupt;
      window.setT5Rate = (rate) => { t5rate = rate; };

  `;
  document.body.appendChild(script);
}
loadt5s();

// Functions to use externally
function speak(text) {
  window.speakt5(text);
}

function stopSpeech() {
  window.interruptt5();
}

function setPlaybackRate(rate) {
  window.setT5Rate(rate);
}
