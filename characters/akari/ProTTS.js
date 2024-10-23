say('Akari TTS (speecht5 running locally) v1.1 is active.');
function loadt5s() {
  const script = document.createElement('script');
  script.type = 'module';
  script.textContent = `

      import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers';

      // Create TTS pipeline
      let synthesizer;
      (async function initializeSynthesizer() {
          synthesizer = await pipeline('text-to-speech', '/Xenova/speecht5_tts', { quantized: false });
          window.t5loadmsg('TTS pipeline initalized.');
      })();

      // Playback rate
      let t5rate = 1.123;
      let stopFlag = false;

      // Split text at punctuation marks and filter empty or non-alphanumeric utterances, also lmit utterance length to 50 characters to speed it up
      function splitText(text) {
  const utterances = text.split(/(?<=[.,!?])\s+/); // Split at comma, period, exclamation mark, or question mark

  const splitUtterances = utterances.map(utterance => {
    if (utterance.length > 50) {
      const splitIndex = utterance.slice(0, 50).lastIndexOf(' ');
      return [utterance.slice(0, splitIndex), utterance.slice(splitIndex + 1)];
    } else {
      return [utterance];
    }
  }).flat();

  // Filter out empty or non-alphanumeric utterances
  return splitUtterances.filter(utterance => /[a-zA-Z0-9]/.test(utterance));
}

      // Define the speak function with split utterances
      async function speak(text) {
          if (!synthesizer) {
              console.error('Synthesizer is not initialized yet.');
              return;
          }
          const utterances = splitText(text);
          window.t5loadmsg('Started talking...');

          for (let i = 0; i < utterances.length; i++) {
              if (stopFlag) {
                  stopFlag = false; // Reset stop flag
                  return; // Stop playing further
              }

              const currentUtterance = utterances[i];

              // Call the emote function before speaking the utterance
              window.t5emote(currentUtterance);

              // Generate speech for the current utterance
              const speaker_embeddings = './new_embeddings.bin';
              const result = await synthesizer(currentUtterance, { speaker_embeddings });

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
      window.t5loadmsg('Finished talking');
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
window.t5emote = emote;

window.t5loadmsg = loadscreen;

function speak(text) {
  window.speakt5(text);
}

function stopSpeech() {
  window.interruptt5();
}

function setPlaybackRate(rate) {
  window.setT5Rate(rate);
}
