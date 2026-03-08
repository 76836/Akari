(function () {
    'use strict';

    // -------------------------------------------------------------------------
    //  Speech queue — holds calls made before the engine is ready
    // -------------------------------------------------------------------------
    window._speechQueue = [];

    // -------------------------------------------------------------------------
    //  Public stubs — safe to call at any time
    // -------------------------------------------------------------------------
    window.speak = function (text) {
        if (window.tts?.isReady) {
            window.tts.speak(text);
        } else {
            console.warn('[TTS] Engine not ready yet — queuing:', text);
            window._speechQueue.push(text);
        }
    };

    window.interruptTTS = function () {
        if (window.tts?.isReady) {
            window.tts.interrupt();
        } else {
            console.warn('[TTS] Engine not ready yet for interruption');
        }
    };

    // -------------------------------------------------------------------------
    //  Loader
    // -------------------------------------------------------------------------
    const loadTTS = async () => {
        try {
            console.log('[TTS] Loading engine…');

            const { KittenTTS } = await import('https://76836.github.io/AkariNet-KittenTTS/AkariNet-KittenTTS-1.0.0.js');

            const ttsSettings = {
                voiceUrl    : 'https://76836.github.io/AkariNet-KittenTTS/default.bin', // raw Float32 voice embedding
                speed       : 1.123,
                concurrency : 2,              // parallel generation jobs
                segmentMax  : 220,            // chars before a chunk is sub-split
                debug       : false,
            };

            // initTTS is defined inside AkariNet-KittenTTS-1.0.0.js and attaches window.tts
            window.initTTS(ttsSettings);

            // Poll until the async init inside KittenTTS finishes
            await new Promise((resolve) => {
                const poll = setInterval(() => {
                    if (window.tts?.isReady) {
                        clearInterval(poll);
                        resolve();
                    }
                }, 100);
            });

            console.log('[TTS] Engine ready!');

            // Flush anything that was queued before we were ready
            if (window._speechQueue.length > 0) {
                console.log(`[TTS] Flushing ${window._speechQueue.length} queued item(s)…`);
                window._speechQueue.forEach(text => window.tts.speak(text));
                window._speechQueue = [];
            }

        } catch (err) {
            console.error('[TTS] Failed to load engine:', err);
        }
    };

    loadTTS();
})();
