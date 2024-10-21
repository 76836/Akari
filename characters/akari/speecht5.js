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

        // Define the speak function
        async function speak(text) {
            if (!synthesizer) {
                console.error('Synthesizer is not initialized yet.');
                return;
            }
            // Generate speech from input text
            const speaker_embeddings = './new_embeddings.bin';
            const result = await synthesizer(text, { speaker_embeddings });
            
            // Create an AudioContext if one does not already exist
            if (!window.audioContext) {
                window.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            // Create an AudioBuffer to store the audio data
            const buffer = window.audioContext.createBuffer(1, result.audio.length, result.sampling_rate);
            const channelData = buffer.getChannelData(0);
            // Copy the audio data from Float32Array to the AudioBuffer
            channelData.set(result.audio);

            // Create a buffer source and play the buffer
            const source = window.audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(window.audioContext.destination);
            source.start();
        }

        // Expose the function to the global scope
        window.speakt5 = speak;
            
        `;
    document.body.appendChild(script);
  }
loadt5s();
function speak(text){
  window.speakt5(text)
};
