/**
 * PiperTTS loader + lipsync playback tap.
 * Engine runtime assets live at https://76836.github.io/AkariNet-PiperTTS/
 * The voice model is hosted on Hugging Face.
 */
(function () {
    'use strict';

    window._speechQueue = window._speechQueue || [];

    var BASE = 'https://76836.github.io/AkariNet-PiperTTS/';
    var MODEL_URL = 'https://huggingface.co/76836-HW/AkariNet-PiperTTS/resolve/main/model.onnx';
    var PLAYBACK_RATE = 1.123;

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

    function encodeWav(samples, sampleRate) {
        var buf = new ArrayBuffer(44 + samples.length * 2);
        var v = new DataView(buf);
        function str(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
        str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true);
        str(8, 'WAVE'); str(12, 'fmt ');
        v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
        v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
        v.setUint16(32, 2, true); v.setUint16(34, 16, true);
        str(36, 'data'); v.setUint32(40, samples.length * 2, true);
        for (var i = 0, o = 44; i < samples.length; i++, o += 2) {
            var s = Math.max(-1, Math.min(1, samples[i]));
            v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        }
        return buf;
    }

    var load = async function () {
        try {
            await ensureLipsync();
            console.log('[TTS] Loading PiperTTS…');

            var tts = {
                isReady: false,
                _worker: null,
                _config: null,
                _queue: [],
                _playing: false,
                _interrupted: false,
                _ctx: null,
                INFERENCE: { noise_scale: 0.667, noise_w: 0.8 },
                PLAYBACK_RATE: PLAYBACK_RATE
            };

            function ensureCtx() {
                if (!tts._ctx) {
                    tts._ctx = new (window.AudioContext || window.webkitAudioContext)({
                        sampleRate: tts._config.audio.sample_rate
                    });
                }
                if (tts._ctx.state === 'suspended') return tts._ctx.resume();
                return Promise.resolve();
            }

            function playNext() {
                if (tts._playing || tts._queue.length === 0) return;
                tts._playing = true;
                var buffer = tts._queue.shift();
                var source = tts._ctx.createBufferSource();
                source.buffer = buffer;
                source.playbackRate.value = PLAYBACK_RATE;
                var finish = function () {
                    tts._playing = false;
                    setTimeout(playNext, 200);
                };
                if (window.AkariLipsync) {
                    window.AkariLipsync.playThrough(tts._ctx, source, finish);
                } else {
                    source.connect(tts._ctx.destination);
                    source.onended = finish;
                }
                source.start();
            }

            // Runtime configuration and worker are hosted by GitHub Pages.
            var cfgRes = await fetch(BASE + 'config.json');
            if (!cfgRes.ok) throw new Error('Failed to load PiperTTS config: HTTP ' + cfgRes.status);
            tts._config = await cfgRes.json();

            tts._worker = new Worker(BASE + 'worker.js');

            // The large ONNX voice model is hosted on Hugging Face, not GitHub Pages.
            var modelRes = await fetch(MODEL_URL);
            if (!modelRes.ok) throw new Error('Failed to load PiperTTS model: HTTP ' + modelRes.status);
            var modelBytes = await modelRes.arrayBuffer();

            await new Promise(function (resolve, reject) {
                var h = function (e) {
                    if (e.data.type === 'ready') {
                        tts._worker.removeEventListener('message', h);
                        resolve();
                    } else if (e.data.type === 'error') {
                        tts._worker.removeEventListener('message', h);
                        reject(new Error(e.data.message));
                    }
                };
                tts._worker.addEventListener('message', h);
                tts._worker.postMessage({
                    type: 'init',
                    modelBytes: modelBytes,
                    config: tts._config
                }, [modelBytes]);
            });

            tts._worker.onmessage = function (e) {
                var d = e.data;
                if (d.type === 'chunk' && !tts._interrupted) {
                    var samples = new Float32Array(d.audio);
                    ensureCtx().then(function () {
                        var buf = tts._ctx.createBuffer(1, samples.length, tts._config.audio.sample_rate);
                        buf.copyToChannel(samples, 0);
                        tts._queue.push(buf);
                        playNext();
                    });
                }
            };

            tts.isReady = true;
            tts.speak = function (text) {
                if (!tts.isReady) {
                    window._speechQueue.push(text);
                    return;
                }
                tts._interrupted = false;
                ensureCtx().then(function () {
                    tts._worker.postMessage({
                        type: 'speak',
                        text: String(text),
                        lengthScale: 1.0,
                        noise_scale: tts.INFERENCE.noise_scale,
                        noise_w: tts.INFERENCE.noise_w
                    });
                });
            };

            tts.interrupt = function () {
                tts._interrupted = true;
                tts._queue = [];
                tts._playing = false;
                if (tts._worker) tts._worker.postMessage({ type: 'stop' });
                if (window.AkariLipsync) window.AkariLipsync.reset();
            };

            window.tts = tts;
            window.speak = function (text) { tts.speak(text); };
            window.interruptTTS = function () { tts.interrupt(); };

            if (window._speechQueue.length) {
                window._speechQueue.forEach(function (t) { tts.speak(t); });
                window._speechQueue = [];
            }

            console.log('[TTS] PiperTTS ready (lipsync enabled, 1.123x playback).');
        } catch (err) {
            console.error('[TTS] Failed to load PiperTTS:', err);
        }
    };

    load();
})();
