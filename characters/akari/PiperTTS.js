/**
 * PiperTTS loader + lipsync playback tap.
 * Engine lives at https://76836.github.io/AkariNet-PiperTTS/
 * Upload model.onnx + WASM/phonemizer binaries to that repo first.
 */
(function () {
    'use strict';

    window._speechQueue = window._speechQueue || [];

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

    // Minimal Piper engine that matches the speak/interrupt surface of Kitten/Pocket
    function createPiperEngine(baseUrl) {
        var BASE = baseUrl.replace(/\/$/, '') + '/';
        var config = null;
        var worker = null;
        var ready = false;
        var audioCtx = null;
        var queue = [];
        var playing = false;
        var interrupted = false;

        var INFERENCE = { noise_scale: 0.667, noise_w: 0.8 };

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

        function ensureCtx() {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: (config && config.audio && config.audio.sample_rate) || 22050 });
            if (audioCtx.state === 'suspended') return audioCtx.resume();
            return Promise.resolve();
        }

        function playNext() {
            if (playing || queue.length === 0) return;
            playing = true;
            var item = queue.shift();
            var source = audioCtx.createBufferSource();
            source.buffer = item;

            var finish = function () {
                playing = false;
                setTimeout(playNext, 200);
            };

            if (window.AkariLipsync) {
                window.AkariLipsync.playThrough(audioCtx, source, finish);
            } else {
                source.connect(audioCtx.destination);
                source.onended = finish;
            }
            source.start();
        }

        async function init() {
            var cfgRes = await fetch(BASE + 'config.json');
            config = await cfgRes.json();

            worker = new Worker(BASE + 'worker.js');

            var modelRes = await fetch(BASE + 'https://huggingface.co/76836-HW/AkariNet-PiperTTS/resolve/main/model.onnx');
            var modelBytes = await modelRes.arrayBuffer();

            await new Promise(function (resolve, reject) {
                var handler = function (e) {
                    if (e.data.type === 'ready') { worker.removeEventListener('message', handler); resolve(); }
                    else if (e.data.type === 'error') { worker.removeEventListener('message', handler); reject(new Error(e.data.message)); }
                };
                worker.addEventListener('message', handler);
                worker.postMessage({ type: 'init', modelBytes: modelBytes, config: config }, [modelBytes]);
            });

            worker.onmessage = function (e) {
                var d = e.data;
                if (d.type === 'chunk') {
                    var samples = new Float32Array(d.audio);
                    var wav = encodeWav(samples, config.audio.sample_rate);
                    // Decode WAV into AudioBuffer for lipsync compatibility
                    audioCtx.decodeAudioData(wav.slice(0)).then(function (buf) {
                        if (!interrupted) {
                            queue.push(buf);
                            playNext();
                        }
                    }).catch(function () {
                        // fallback: create buffer directly
                        var buf = audioCtx.createBuffer(1, samples.length, config.audio.sample_rate);
                        buf.copyToChannel(samples, 0);
                        if (!interrupted) {
                            queue.push(buf);
                            playNext();
                        }
                    });
                }
            };

            ready = true;
            console.log('[PiperTTS] Ready');
        }

        return {
            get isReady() { return ready; },
            ready: null, // filled below
            speak: function (text) {
                if (!ready) {
                    window._speechQueue.push(text);
                    return;
                }
                interrupted = false;
                ensureCtx().then(function () {
                    worker.postMessage({
                        type: 'speak',
                        text: text,
                        lengthScale: 1.0,
                        noise_scale: INFERENCE.noise_scale,
                        noise_w: INFERENCE.noise_w
                    });
                });
            },
            interrupt: function () {
                interrupted = true;
                queue = [];
                playing = false;
                if (worker) worker.postMessage({ type: 'stop' });
                if (window.AkariLipsync) window.AkariLipsync.reset();
            }
        };
    }

    window.speak = function (text) {
        if (window.tts && window.tts.isReady) {
            window.tts.speak(text);
        } else {
            window._speechQueue.push(text);
        }
    };

    window.interruptTTS = function () {
        if (window.AkariLipsync) window.AkariLipsync.reset();
        if (window.tts && typeof window.tts.interrupt === 'function') {
            window.tts.interrupt();
        }
    };

    var load = async function () {
        try {
            await ensureLipsync();
            console.log('[TTS] Loading PiperTTS…');

            var engine = createPiperEngine('https://76836.github.io/AkariNet-PiperTTS');
            engine.ready = engine.init ? engine.init() : Promise.resolve();
            // init is internal; call it
            await (async function () {
                // re-bind so we can await the real init
                var e = createPiperEngine('https://76836.github.io/AkariNet-PiperTTS');
                // the create function already has init closed over; call the internal one via a small hack
                // Better: expose init on the returned object
            })();

            // Cleaner version: rebuild with explicit init
            var BASE = 'https://76836.github.io/AkariNet-PiperTTS/';
            var tts = {
                isReady: false,
                _worker: null,
                _config: null,
                _queue: [],
                _playing: false,
                _interrupted: false,
                _ctx: null,
                INFERENCE: { noise_scale: 0.667, noise_w: 0.8 }
            };

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

            function ensureCtx() {
                if (!tts._ctx) tts._ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: tts._config.audio.sample_rate });
                if (tts._ctx.state === 'suspended') return tts._ctx.resume();
                return Promise.resolve();
            }

            function playNext() {
                if (tts._playing || tts._queue.length === 0) return;
                tts._playing = true;
                var buffer = tts._queue.shift();
                var source = tts._ctx.createBufferSource();
                source.buffer = buffer;
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

            // Load config + model + worker
            var cfgRes = await fetch(BASE + 'config.json');
            tts._config = await cfgRes.json();

            tts._worker = new Worker(BASE + 'worker.js');

            var modelRes = await fetch(BASE + 'model.onnx');
            if (!modelRes.ok) throw new Error('model.onnx not found — upload it to AkariNet-PiperTTS');
            var modelBytes = await modelRes.arrayBuffer();

            await new Promise(function (resolve, reject) {
                var h = function (e) {
                    if (e.data.type === 'ready') { tts._worker.removeEventListener('message', h); resolve(); }
                    else if (e.data.type === 'error') { tts._worker.removeEventListener('message', h); reject(new Error(e.data.message)); }
                };
                tts._worker.addEventListener('message', h);
                tts._worker.postMessage({ type: 'init', modelBytes: modelBytes, config: tts._config }, [modelBytes]);
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
                if (!tts.isReady) { window._speechQueue.push(text); return; }
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

            console.log('[TTS] PiperTTS ready (lipsync enabled).');
        } catch (err) {
            console.error('[TTS] Failed to load PiperTTS:', err);
        }
    };

    load();
})();
