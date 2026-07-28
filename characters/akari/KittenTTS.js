/**
 * KittenTTS loader + lipsync tap on playback.
 */
(function () {
    'use strict';

    window._speechQueue = [];

    function ensureLipsync() {
        if (window.AkariLipsync) return Promise.resolve();
        return new Promise(function (resolve) {
            var s = document.createElement('script');
            s.src = './engine/lipsync.js';
            s.onload = resolve;
            s.onerror = resolve;
            document.head.appendChild(s);
        });
    }

    function hookPlayback(tts) {
        if (!tts || tts.__lipsyncHooked) return;
        tts.__lipsyncHooked = true;

        tts._playNextInOrder = function () {
            if (tts._isPlaying) return;
            if (!tts._pendingAudio || !tts._pendingAudio.has(tts._nextPlayIndex)) return;

            tts._isPlaying = true;
            var buffer = tts._pendingAudio.get(tts._nextPlayIndex);
            tts._pendingAudio.delete(tts._nextPlayIndex);
            tts._nextPlayIndex++;

            var source = tts._audioCtx.createBufferSource();
            source.buffer = buffer;

            var finish = function () {
                tts._isPlaying = false;
                setTimeout(function () { tts._playNextInOrder(); }, 250);
            };

            if (window.AkariLipsync) {
                window.AkariLipsync.playThrough(tts._audioCtx, source, finish);
            } else {
                source.connect(tts._audioCtx.destination);
                source.onended = finish;
            }

            if (tts.config && tts.config.debug) {
                console.log('[KittenTTS] ▶ Playing segment (' + buffer.duration.toFixed(2) + 's) [lipsync]');
            }
            source.start();
        };

        var origInterrupt = tts.interrupt.bind(tts);
        tts.interrupt = function () {
            if (window.AkariLipsync) window.AkariLipsync.reset();
            return origInterrupt();
        };
    }

    window.speak = function (text) {
        if (window.tts && window.tts.isReady) {
            window.tts.speak(text);
        } else {
            console.warn('[TTS] Engine not ready yet — queuing:', text);
            window._speechQueue.push(text);
        }
    };

    window.interruptTTS = function () {
        if (window.AkariLipsync) window.AkariLipsync.reset();
        if (window.tts && window.tts.isReady) {
            window.tts.interrupt();
        }
    };

    var loadTTS = async function () {
        try {
            await ensureLipsync();
            console.log('[TTS] Loading KittenTTS…');

            await import('https://76836.github.io/AkariNet-KittenTTS/AkariNet-KittenTTS-1.0.0.js');

            var ttsSettings = {
                voiceUrl: 'https://76836.github.io/AkariNet-KittenTTS/default.bin',
                speed: 1.123,
                concurrency: 2,
                segmentMax: 220,
                debug: false
            };

            window.initTTS(ttsSettings);

            await new Promise(function (resolve) {
                var poll = setInterval(function () {
                    if (window.tts && window.tts.isReady) {
                        clearInterval(poll);
                        hookPlayback(window.tts);
                        resolve();
                    }
                }, 100);
            });

            console.log('[TTS] KittenTTS ready (lipsync enabled).');

            if (window._speechQueue.length > 0) {
                window._speechQueue.forEach(function (text) { window.tts.speak(text); });
                window._speechQueue = [];
            }
        } catch (err) {
            console.error('[TTS] Failed to load engine:', err);
        }
    };

    loadTTS();
})();
