/**
 * PocketTTS loader + lipsync tap on playback.
 */
(function () {
    'use strict';

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

        tts.playNextAudio = function () {
            if (tts.isPlaying) return;
            if (!tts.audioQueue || tts.audioQueue.length === 0) return;

            tts.isPlaying = true;
            var buffer = tts.audioQueue.shift();
            var source = tts.audioContext.createBufferSource();
            source.buffer = buffer;

            var finish = function () {
                tts.isPlaying = false;
                setTimeout(function () { tts.playNextAudio(); }, 250);
            };

            if (window.AkariLipsync) {
                window.AkariLipsync.playThrough(tts.audioContext, source, finish);
            } else {
                source.connect(tts.audioContext.destination);
                source.onended = finish;
            }
            source.start();
        };

        var origInterrupt = tts.interrupt.bind(tts);
        tts.interrupt = function () {
            if (window.AkariLipsync) window.AkariLipsync.reset();
            return origInterrupt();
        };
    }

    var loadPocketTTS = async function () {
        try {
            await ensureLipsync();
            console.log('Loading PocketTTS...');
            await import('https://76836.github.io/AkariNet-PocketTTS/AkariNet_PocketTTS.js');

            var ttsSettings = {
                voiceUrl: 'https://76836.github.io/AkariNet-PocketTTS/voice.mp3',
                speed: 1.123,
                steps: 4,
                temperature: 1.2,
                streaming: false
            };

            console.log('Initializing PocketTTS...');
            if (typeof window.initTTS === 'function') {
                await window.initTTS(ttsSettings);
            }

            // Wait until engine instance exists
            await new Promise(function (resolve) {
                var n = 0;
                var id = setInterval(function () {
                    if (window.tts && window.tts.audioContext) {
                        clearInterval(id);
                        hookPlayback(window.tts);
                        resolve();
                    } else if (++n > 200) {
                        clearInterval(id);
                        resolve();
                    }
                }, 50);
            });

            window.speak = function (text) {
                if (window.tts && typeof window.tts.speak === 'function') {
                    window.tts.speak(text);
                } else {
                    if (!window._speechQueue) window._speechQueue = [];
                    window._speechQueue.push(text);
                }
            };

            window.interruptTTS = function () {
                if (window.AkariLipsync) window.AkariLipsync.reset();
                if (window.tts && typeof window.tts.interrupt === 'function') {
                    window.tts.interrupt();
                }
            };

            if (window._speechQueue && window._speechQueue.length) {
                window._speechQueue.forEach(function (t) { window.speak(t); });
                window._speechQueue = [];
            }

            console.log('PocketTTS loaded (lipsync enabled).');
        } catch (error) {
            console.error('Failed to load PocketTTS:', error);
        }
    };

    window.speak = function (text) {
        if (!window._speechQueue) window._speechQueue = [];
        window._speechQueue.push(text);
    };
    window.interruptTTS = function () {
        if (window.AkariLipsync) window.AkariLipsync.reset();
    };

    loadPocketTTS();
})();
