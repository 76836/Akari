say('Akari TTS (speecht5 running locally) v1.2 (experimental) is active.');

function loadt5s() {
  const script = document.createElement('script');
  script.type = 'module';
  script.textContent = `

    import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers';

    // Create TTS pipeline
    let synthesizer;
    (async function initializeSynthesizer() {
        synthesizer = await pipeline('text-to-speech', 'Xenova/speecht5_tts', { dtype: 'fp32' });
        window.t5loadmsg('TTS pipeline initialized.');
    })();

    // Playback rate
    let t5rate = 1.123;
    let stopFlag = false;

    // Split text at punctuation marks and filter empty or non-alphanumeric utterances, limit utterance length to 50 characters
    function splitText(text) {
        const utterances = text.split(/(?<=[.,!?])\\s+/);

        const splitUtterances = utterances.map(utterance => {
            if (utterance.length > 50) {
                const splitIndex = utterance.slice(0, 50).lastIndexOf(' ');
                return [utterance.slice(0, splitIndex), utterance.slice(splitIndex + 1)];
            } else {
                return [utterance];
            }
        }).flat();

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
                stopFlag = false;
                return;
            }

            const currentUtterance = utterances[i];

            window.t5emote(currentUtterance);

            // Generate speech for the current utterance
            const speaker_embeddings = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin';
            const result = await synthesizer(currentUtterance, { speaker_embeddings });

            if (!window.audioContext) {
                window.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            const buffer = window.audioContext.createBuffer(1, result.audio.length, result.sampling_rate);
            const channelData = buffer.getChannelData(0);
            channelData.set(result.audio);

            const source = window.audioContext.createBufferSource();
            source.buffer = buffer;
            source.playbackRate.value = t5rate;
            source.connect(window.audioContext.destination);

            source.start();

            await new Promise(resolve => source.onended = resolve);
        }
    }
    
    window.t5loadmsg('Finished talking');

    function interrupt() {
        if (window.audioContext) {
            window.audioContext.close();
            window.audioContext = null;
        }
        stopFlag = true;
    }

    window.speakt5 = speak;
    window.interruptt5 = interrupt;
    window.setT5Rate = (rate) => { t5rate = rate; };

  `;
  document.body.appendChild(script);
}
loadt5s();

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