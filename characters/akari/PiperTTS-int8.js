/**
 * PiperTTS int8 — production voice for AkariNet.
 * Quantized model (HF 76836-HW/AkariNet-PiperTTS), ORT 1.30 worker, Cache API,
 * adaptive inter-chunk gap (200ms target), inter-word silence pad, larger chunks,
 * speaking rate 0.76 with short phrases (<3 words) 40% slower.
 */
(function () {
    'use strict';

    window._speechQueue = window._speechQueue || [];

    // Claim speak immediately so index.html cannot fall back to speechSynthesis
    // while the int8 model is still downloading / initializing.
    var _ttsLoading = true;
    function enqueueSpeak(text) {
        if (text == null || text === '') return;
        window._speechQueue.push(String(text));
    }
    window.tts = {
        isReady: false,
        speak: enqueueSpeak,
        interrupt: function () { window._speechQueue = []; }
    };
    window.speak = function (text) {
        if (window.tts && window.tts.isReady && typeof window.tts.speak === 'function' && window.tts.speak !== enqueueSpeak) {
            window.tts.speak(text);
        } else {
            enqueueSpeak(text);
        }
    };
    window.interruptTTS = function () {
        if (window.tts && typeof window.tts.interrupt === 'function') window.tts.interrupt();
        else window._speechQueue = [];
    };

    // Loading status — same notification pattern as Audio Console progress toast.
    var _ttsProgNote = null;
    function _ensureTtsProgNote() {
        var area = document.getElementById('notificationArea');
        if (!area) return null;
        if (_ttsProgNote && _ttsProgNote.isConnected) return _ttsProgNote;
        var note = document.createElement('div');
        note.className = 'notification-container ac-progress-note show';
        note.innerHTML =
            '<div class="notification-content">' +
            '<div class="notification-title">Akari Voice</div>' +
            '<div class="notification-body ac-prog-body">Starting…</div>' +
            '<div class="ac-prog-track"><div class="ac-prog-fill" style="width:0%"></div></div>' +
            '</div>' +
            '<button class="notification-close" type="button" aria-label="Dismiss">✕</button>';
        var close = function () {
            note.classList.remove('show');
            setTimeout(function () { try { note.remove(); } catch (_) {} }, 350);
            if (_ttsProgNote === note) _ttsProgNote = null;
        };
        note.querySelector('.notification-close').onclick = close;
        area.prepend(note);
        _ttsProgNote = note;
        return note;
    }
    function ttsProgress(percent, text) {
        var p = Math.max(0, Math.min(100, Math.round(percent)));
        var msg = text || 'Loading…';
        var note = _ensureTtsProgNote();
        if (note) {
            var body = note.querySelector('.ac-prog-body');
            var fill = note.querySelector('.ac-prog-fill');
            if (body) body.textContent = (p < 100 ? '[' + p + '%] ' : '') + msg;
            if (fill) fill.style.width = p + '%';
            if (p >= 100) {
                setTimeout(function () {
                    if (_ttsProgNote === note) {
                        note.classList.remove('show');
                        setTimeout(function () { try { note.remove(); } catch (_) {} }, 350);
                        _ttsProgNote = null;
                    }
                }, 1600);
            }
        } else if (window.app && typeof window.app.notify === 'function') {
            try {
                window.app.notify('Akari Voice', (p < 100 ? '[' + p + '%] ' : '') + msg, {
                    borderColors: ['#00c8c8', '#6aa8ff']
                });
            } catch (_) {}
        } else if (typeof window.showNotification === 'function') {
            try { window.showNotification('Akari Voice', (p < 100 ? '[' + p + '%] ' : '') + msg); } catch (_) {}
        }
        console.log('[TTS]', p + '%', msg);
    }

    var BASE = 'https://76836.github.io/AkariNet-PiperTTS/';
    // Quantized int8 voice. Config is mirrored on Pages (HF JSON is CORS-locked to huggingface.co).
    var MODEL_URL = 'https://huggingface.co/76836-HW/AkariNet-PiperTTS/resolve/main/akari-low-step1200-int8.onnx';
    var CONFIG_URL = BASE + 'config-int8.json';
    var CONFIG_URL_FALLBACK = BASE + 'config.json';
    var PLAYBACK_RATE = 1.123;

    // Larger chunks → fewer model runs → less inter-utterance lag.
    // int8 is fast enough that ~90-char spans still sound fine.
    var TARGET_CHARS = 90;
    var MAX_CHARS = 120;
    var MIN_WORDS = 2;
    // Speaking rate: 1.0 = normal speed, higher = faster, lower = slower.
    // Mapped to Piper length_scale as 1/rate. Short phrases stay 40% slower (×1.4 duration).
    var SPEAKING_RATE = 0.76;
    var SHORT_PHRASE_WORDS = 3;
    var SHORT_PHRASE_SLOWDOWN = 1.4; // 40% slower than the current base rate
    // Target pause between chunks. Adaptive: delay = max(0, gap - silence already elapsed).
    var CHUNK_GAP_MS = 200;
    var MODEL_CACHE = 'akari-piper-int8-v1';

    // Intra-chunk silence padding: only stretch *confident* inter-word gaps.
    var SILENCE_PAD_ENABLED = true;
    var SILENCE_PAD_MS = 25;           // extra silence added per confident gap
    var SILENCE_MIN_MS = 48;           // natural gap must already be at least this long
    var SILENCE_MAX_MS = 180;          // ignore long pauses (already enough space)
    var SILENCE_RMS = 0.012;           // max RMS to count as silence
    var SILENCE_EDGE_MS = 40;          // do not pad near clip edges
    var SILENCE_SIDE_MS = 30;          // require speech energy on both sides
    var SILENCE_SIDE_RMS = 0.04;       // min RMS in side windows
    var SILENCE_MAX_PADS = 8;          // cap pads per chunk
    var SILENCE_MAX_TOTAL_MS = 200;    // cap total added time per chunk


    /**
     * Expand only high-confidence inter-word silences.
     * Rejects short energy dips (stops, fricatives) and edge/trailing hush.
     */
    function padConfidentSilences(samples, sampleRate) {
        if (!SILENCE_PAD_ENABLED || !samples || !samples.length || !sampleRate) {
            return { samples: samples, pads: 0, addedMs: 0 };
        }
        var n = samples.length;
        var minLen = Math.max(1, Math.round(sampleRate * SILENCE_MIN_MS / 1000));
        var maxLen = Math.max(minLen, Math.round(sampleRate * SILENCE_MAX_MS / 1000));
        var edge = Math.round(sampleRate * SILENCE_EDGE_MS / 1000);
        var side = Math.max(1, Math.round(sampleRate * SILENCE_SIDE_MS / 1000));
        var padSamples = Math.round(sampleRate * SILENCE_PAD_MS / 1000);
        if (padSamples < 1 || n < edge * 2 + minLen) {
            return { samples: samples, pads: 0, addedMs: 0 };
        }

        // One linear pass: mark silent samples (cheap abs threshold)
        var silent = new Uint8Array(n);
        var thr = SILENCE_RMS * 2.2;
        for (var i = 0; i < n; i++) {
            silent[i] = Math.abs(samples[i]) <= thr ? 1 : 0;
        }

        function rms(start, end) {
            start = Math.max(0, start);
            end = Math.min(n, end);
            if (end <= start) return 0;
            var s = 0;
            for (var j = start; j < end; j++) {
                var v = samples[j];
                s += v * v;
            }
            return Math.sqrt(s / (end - start));
        }

        function peakAbs(start, end) {
            start = Math.max(0, start);
            end = Math.min(n, end);
            var p = 0;
            for (var j = start; j < end; j++) {
                var a = Math.abs(samples[j]);
                if (a > p) p = a;
            }
            return p;
        }

        var regions = [];
        var i = edge;
        var endLimit = n - edge;
        while (i < endLimit) {
            if (!silent[i]) {
                i++;
                continue;
            }
            var a = i;
            while (i < endLimit && silent[i]) i++;
            var b = i;
            var len = b - a;
            // Always advanced past the run (i is at first non-silent or endLimit)
            if (len < minLen || len > maxLen) continue;

            var leftR = rms(a - side, a);
            var rightR = rms(b, b + side);
            var leftP = peakAbs(a - side, a);
            var rightP = peakAbs(b, b + side);
            if (leftR < SILENCE_SIDE_RMS || rightR < SILENCE_SIDE_RMS) continue;
            if (leftP < SILENCE_SIDE_RMS * 1.6 || rightP < SILENCE_SIDE_RMS * 1.6) continue;

            var gapR = rms(a, b);
            var gapP = peakAbs(a, b);
            if (gapP > thr * 1.2) continue;
            if (gapR > SILENCE_RMS) continue;
            if (gapR > leftR * 0.4 || gapR > rightR * 0.4) continue;

            regions.push({ a: a, b: b });
            if (regions.length >= SILENCE_MAX_PADS) break;
        }

        if (!regions.length) {
            return { samples: samples, pads: 0, addedMs: 0 };
        }

        var maxTotal = Math.round(sampleRate * SILENCE_MAX_TOTAL_MS / 1000);
        var added = 0;
        var use = [];
        for (var r = 0; r < regions.length; r++) {
            if (added + padSamples > maxTotal) break;
            use.push(regions[r]);
            added += padSamples;
        }

        var out = new Float32Array(n + use.length * padSamples);
        var si = 0;
        var oi = 0;
        for (var u = 0; u < use.length; u++) {
            var mid = (use[u].a + use[u].b) >> 1;
            if (mid < si) mid = si;
            out.set(samples.subarray(si, mid), oi);
            oi += mid - si;
            oi += padSamples; // zero-filled
            si = mid;
        }
        out.set(samples.subarray(si), oi);

        return {
            samples: out,
            pads: use.length,
            addedMs: (use.length * padSamples * 1000) / sampleRate
        };
    }

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

    // Remove presentation/formatting text while preserving the words an AI
    // actually intended to say. This deliberately does not alter the message
    // shown to the user; it only affects the TTS input.
    function cleanForSpeech(raw) {
        if (!raw || !String(raw).trim()) return '';
        var text = String(raw).replace(/\r\n?/g, '\n');

        // Code blocks are almost never useful as spoken dialogue.
        text = text.replace(/```[\s\S]*?```/g, ' ');
        text = text.replace(/~~~[\s\S]*?~~~/g, ' ');

        // Markdown links: speak the visible label, not the URL.
        text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, ' ');
        text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
        text = text.replace(/https?:\/\/\S+/gi, ' ');

        // Markdown headings, blockquotes and list markers.
        text = text.replace(/^\s{0,3}#{1,6}\s+/gm, '');
        text = text.replace(/^\s*>+\s?/gm, '');
        text = text.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/gm, '');
        text = text.replace(/^\s*[-*_]{3,}\s*$/gm, ' ');

        // Tables are presentation markup, not dialogue.
        text = text.replace(/^\s*\|.*\|\s*$/gm, function (line) {
            return /\|\s*:?-{2,}:?\s*(?:\||$)/.test(line) ? ' ' : line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').replace(/\s*\|\s*/g, ', ');
        });

        // Inline code, strikethrough, bold and emphasis. Preserve the content.
        text = text.replace(/`([^`]+)`/g, '$1');
        text = text.replace(/~~([^~]+)~~/g, '$1');
        text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
        text = text.replace(/([*_])(.*?)\1/g, '$2');

        // Roleplay/action annotations. Common actions are removed entirely;
        // starred non-actions keep their contents, so *important* remains
        // speakable while *yawn* / *smiles* / *sighs* disappear.
        var actionWords = /^(?:ahem|blinks?|blush(?:es|ing)?|chuckles?|coughs?|cries|exhales?|giggles?|gasps?|grins?|groans?|laughs?|nods?|pants?|shrugs?|sighs?|smiles?|sniffles?|sobs?|stammers?|stares?|yawns?|whispers?|winces?)\.?$/i;
        text = text.replace(/\*([^*\n]+)\*/g, function (_, content) {
            return actionWords.test(content.trim()) ? ' ' : content;
        });

        // Parenthesized/bracketed roleplay actions, but only when they look
        // like actions rather than ordinary explanatory prose.
        text = text.replace(/\(([^()\n]{1,40})\)/g, function (whole, content) {
            return actionWords.test(content.trim()) ? ' ' : whole;
        });
        text = text.replace(/\[([^\[\]\n]{1,40})\]/g, function (whole, content) {
            return actionWords.test(content.trim()) ? ' ' : whole;
        });

        // Remove common citation/UI artifacts and stray formatting characters.
        text = text.replace(/\[(?:\d+|citation|source|ref)\]/gi, ' ');
        text = text.replace(/[\u200B-\u200D\uFEFF]/g, '');
        text = text.replace(/[<>^|{}]/g, ' ');
        text = text.replace(/\s*([*_~`])\s*/g, ' ');

        // Normalize punctuation that is useful for prosody.
        text = text.replace(/\.{4,}/g, '...');
        text = text.replace(/!{2,}/g, '!');
        text = text.replace(/\?{2,}/g, '?');
        text = text.replace(/\s*—\s*/g, ', ');
        text = text.replace(/\s*–\s*/g, ', ');
        text = text.replace(/[ \t]+/g, ' ');
        text = text.split('\n').map(function (line) { return line.trim(); }).filter(Boolean).join(' ');
        return text.trim();
    }

    function protectAbbreviations(text) {
        var token = 'PIPER_DOT';
        var abbreviations = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'Sr.', 'Jr.', 'St.', 'vs.', 'etc.', 'e.g.', 'i.e.'];
        abbreviations.forEach(function (abbr) {
            text = text.replace(new RegExp('\\b' + abbr.replace(/\./g, '\\.') + '(?=\\s|$)', 'gi'), function (m) {
                return m.replace(/\./g, token);
            });
        });
        text = text.replace(/\b(\d+)\.(?=\d)/g, '$1' + token);
        return { text: text, token: token };
    }

    function restoreProtected(text, token) {
        return text.replace(new RegExp(token, 'g'), '.');
    }

    function wordCount(text) {
        var m = text.trim().match(/\S+/g);
        return m ? m.length : 0;
    }

        function lengthScaleFor(text) {
        var rate = Math.max(0.5, Math.min(2.0, SPEAKING_RATE));
        var base = 1 / rate;
        var words = wordCount(text);
        if (words > 0 && words < SHORT_PHRASE_WORDS) return base * SHORT_PHRASE_SLOWDOWN;
        return base;
    }



    function splitLongChunk(text) {
        var chunks = [];
        var remaining = text.trim();
        while (remaining.length > MAX_CHARS) {
            var window = remaining.slice(0, MAX_CHARS + 1);
            var cut = -1;

            // Prefer a natural clause boundary close to the target.
            var punctuation = /[,;:]\s+/g;
            var match;
            while ((match = punctuation.exec(window))) {
                if (match.index + 1 <= MAX_CHARS) cut = match.index + 1;
            }

            // Fall back to the last word boundary.
            if (cut < 1) {
                var space = window.lastIndexOf(' ', MAX_CHARS);
                cut = space > 0 ? space : MAX_CHARS;
            }

            chunks.push(remaining.slice(0, cut).trim());
            remaining = remaining.slice(cut).trim();
        }
        if (remaining) chunks.push(remaining);
        return chunks;
    }

    function parseForSpeech(rawText) {
        var cleaned = cleanForSpeech(rawText);
        if (!cleaned) return [];

        var protectedText = protectAbbreviations(cleaned);
        var text = protectedText.text;
        var token = protectedText.token;

        // First split at actual sentence endings. This is more reliable than
        // blindly splitting every comma and preserves normal TTS prosody.
        var parts = text.split(/(?<=[.!?]+["')\]]?)\s+/);
        var chunks = [];
        parts.forEach(function (part) {
            part = part.trim();
            if (!part) return;
            chunks = chunks.concat(splitLongChunk(part));
        });

        // Merge tiny fragments into their neighbour when possible. A lone
        // "Yes." should still be spoken, but "Okay, /" should not become its
        // own awkward TTS job.
        for (var i = 0; i < chunks.length - 1; i++) {
            if (chunks[i].length < 12 && (chunks[i].endsWith(',') || chunks[i].endsWith(':'))) {
                chunks[i + 1] = chunks[i] + ' ' + chunks[i + 1];
                chunks.splice(i, 1);
                i--;
            }
        }

        return chunks.map(function (chunk) {
            chunk = restoreProtected(chunk, token).replace(/\s+/g, ' ').trim();
            return {
                text: chunk,
                lengthScale: lengthScaleFor(chunk),
                words: wordCount(chunk)
            };
        }).filter(function (item) {
            return item.text && item.words >= MIN_WORDS || (item.text && item.text.length > 0);
        });
    }

    var load = async function () {
        try {
            await ensureLipsync();
            ttsProgress(5, 'Starting Piper int8…');
            console.log('[TTS] Loading PiperTTS int8…');

            var tts = {
                isReady: false,
                _worker: null,
                _config: null,
                _queue: [],
                _playing: false,
                _interrupted: false,
                _ctx: null,
                INFERENCE: { noise_scale: 0.1, noise_w: 0.89 }
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

            function adaptiveGapMs() {
                // Credit silence already elapsed since previous buffer ended.
                // Slow inference after end → elapsed large → delay 0.
                // Fast inference / buffer ready early → pad up to CHUNK_GAP_MS.
                if (!tts._lastEndedAt) return 0;
                var elapsed = performance.now() - tts._lastEndedAt;
                return Math.max(0, CHUNK_GAP_MS - elapsed);
            }

            function playNext() {
                if (tts._playing || tts._queue.length === 0) return;
                if (tts._gapTimer) return;

                var delay = adaptiveGapMs();
                if (delay > 0) {
                    tts._gapTimer = setTimeout(function () {
                        tts._gapTimer = null;
                        playNext();
                    }, delay);
                    return;
                }

                tts._playing = true;
                var buffer = tts._queue.shift();
                if (tts._queueMeta && tts._queueMeta.length) tts._queueMeta.shift();
                var source = tts._ctx.createBufferSource();
                source.buffer = buffer;
                source.playbackRate.value = PLAYBACK_RATE;
                var finish = function () {
                    tts._playing = false;
                    tts._lastEndedAt = performance.now();
                    if (tts._queue.length === 0) {
                        try {
                            window.dispatchEvent(new CustomEvent('akari:tts-end', {
                                detail: { source: 'PiperTTS-int8' }
                            }));
                        } catch (_) {}
                        return;
                    }
                    playNext();
                };

                if (window.AkariLipsync) {
                    window.AkariLipsync.playThrough(tts._ctx, source, finish);
                } else {
                    source.connect(tts._ctx.destination);
                    source.onended = finish;
                }
                source.start();
            }

            // Prefer the int8 companion JSON so sample rate / phoneme map match the model.
            async function fetchJson(url) {
                console.log('[TTS] fetch config', url);
                var res = await fetch(url);
                if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
                return res.json();
            }

            ttsProgress(12, 'Loading voice config…');
            try {
                tts._config = await fetchJson(CONFIG_URL);
            } catch (cfgErr) {
                console.warn('[TTS] int8 config failed, fallback:', cfgErr && cfgErr.message);
                tts._config = await fetchJson(CONFIG_URL_FALLBACK);
            }
            console.log('[TTS] config sample_rate=', tts._config.audio && tts._config.audio.sample_rate);

            ttsProgress(22, 'Starting voice worker…');
            tts._worker = new Worker(BASE + 'worker-int8.js');
            console.log('[TTS] worker created');

            async function loadModelBytes() {
                // Cache API: second load is local, no HF round-trip
                if (typeof caches !== 'undefined') {
                    try {
                        var cache = await caches.open(MODEL_CACHE);
                        var hit = await cache.match(MODEL_URL);
                        if (hit && hit.ok) {
                            var cached = await hit.arrayBuffer();
                            if (cached.byteLength > 1000) {
                                console.log('[TTS] model cache hit', cached.byteLength, 'bytes');
                                ttsProgress(70, 'Voice model loaded from cache');
                                return cached;
                            }
                        }
                    } catch (cacheErr) {
                        console.warn('[TTS] cache read failed', cacheErr && cacheErr.message);
                    }
                }

                ttsProgress(28, 'Downloading voice model…');
                console.log('[TTS] fetching model', MODEL_URL);
                var modelRes = await fetch(MODEL_URL);
                if (!modelRes.ok) throw new Error('Failed to load PiperTTS int8 model: HTTP ' + modelRes.status);
                var total = Number(modelRes.headers.get('content-length') || 0);
                var modelBytes;
                if (modelRes.body && total > 0 && modelRes.body.getReader) {
                    var reader = modelRes.body.getReader();
                    var chunks = [];
                    var received = 0;
                    var lastPct = -1;
                    for (;;) {
                        var step = await reader.read();
                        if (step.done) break;
                        chunks.push(step.value);
                        received += step.value.length;
                        var pct = Math.floor((received / total) * 100);
                        if (pct >= lastPct + 10 || received === total) {
                            lastPct = pct;
                            console.log('[TTS] model download ' + pct + '% (' + received + '/' + total + ')');
                            // Map download 0–100 → progress 28–75
                            ttsProgress(28 + Math.round(pct * 0.47), 'Downloading voice model…');
                        }
                    }
                    var merged = new Uint8Array(received);
                    var offset = 0;
                    for (var ci = 0; ci < chunks.length; ci++) {
                        merged.set(chunks[ci], offset);
                        offset += chunks[ci].length;
                    }
                    modelBytes = merged.buffer;
                } else {
                    modelBytes = await modelRes.arrayBuffer();
                }
                console.log('[TTS] model bytes', modelBytes.byteLength);

                if (typeof caches !== 'undefined') {
                    try {
                        var cacheW = await caches.open(MODEL_CACHE);
                        await cacheW.put(MODEL_URL, new Response(modelBytes.slice(0), {
                            headers: { 'Content-Type': 'application/octet-stream' }
                        }));
                        console.log('[TTS] model cached for next load');
                    } catch (cacheWriteErr) {
                        console.warn('[TTS] cache write failed', cacheWriteErr && cacheWriteErr.message);
                    }
                }
                return modelBytes;
            }

            var modelBytes = await loadModelBytes();

            await new Promise(function (resolve, reject) {
                var settled = false;
                var h = function (e) {
                    console.log('[TTS] worker message', e.data && e.data.type, e.data && e.data.message);
                    if (e.data.type === 'ready') {
                        if (settled) return;
                        settled = true;
                        tts._worker.removeEventListener('message', h);
                        resolve();
                    } else if (e.data.type === 'error') {
                        if (settled) return;
                        settled = true;
                        tts._worker.removeEventListener('message', h);
                        reject(new Error(e.data.message || 'worker error'));
                    }
                };
                tts._worker.addEventListener('message', h);
                tts._worker.addEventListener('error', function (ev) {
                    if (settled) return;
                    settled = true;
                    reject(new Error('worker script error: ' + (ev.message || 'unknown')));
                });
                ttsProgress(85, 'Initializing voice engine…');
            console.log('[TTS] posting init to worker…');
                tts._worker.postMessage({ type: 'init', modelBytes: modelBytes, config: tts._config }, [modelBytes]);
            });
            console.log('[TTS] worker session ready');
            ttsProgress(95, 'Voice engine ready…');

            tts._worker.onmessage = function (e) {
                var d = e.data;
                if (d.type === 'chunk' && !tts._interrupted) {
                    var samples = new Float32Array(d.audio);
                    ensureCtx().then(function () {
                        var sr = tts._config.audio.sample_rate;
                        var padded = { samples: samples, pads: 0, addedMs: 0 };
                        try {
                            padded = padConfidentSilences(samples, sr);
                            samples = padded.samples;
                        } catch (padErr) {
                            console.warn('[TTS] silence pad skipped', padErr && padErr.message);
                            padded = { samples: samples, pads: 0, addedMs: 0 };
                        }
                        var buf = tts._ctx.createBuffer(1, samples.length, sr);
                        buf.copyToChannel(samples, 0);
                        tts._queue.push(buf);
                        tts._queueMeta = tts._queueMeta || [];
                        tts._queueMeta.push({
                            readyAt: performance.now(),
                            samples: samples.length,
                            pads: padded.pads,
                            addedMs: padded.addedMs
                        });
                        playNext();
                    });
                }
            };

            // Production: fixed defaults (no runtime knobs).
            tts.speak = function (text) {
                if (text == null || text === '') return;
                if (!tts.isReady) {
                    enqueueSpeak(text);
                    return;
                }
                var segments = parseForSpeech(text);
                if (!segments.length) return;
                tts._interrupted = false;
                tts._lastEndedAt = 0;
                if (tts._gapTimer) { clearTimeout(tts._gapTimer); tts._gapTimer = null; }
                ensureCtx().then(function () {
                    tts._worker.postMessage({
                        type: 'speak',
                        segments: segments,
                        noise_scale: tts.INFERENCE.noise_scale,
                        noise_w: tts.INFERENCE.noise_w
                    });
                });
            };
            tts.isReady = true;
            _ttsLoading = false;

            tts.interrupt = function () {
                tts._interrupted = true;
                tts._queue = [];
                tts._queueMeta = [];
                tts._playing = false;
                if (tts._gapTimer) { clearTimeout(tts._gapTimer); tts._gapTimer = null; }
                tts._lastEndedAt = 0;
                if (tts._worker) tts._worker.postMessage({ type: 'stop' });
                if (window.AkariLipsync) window.AkariLipsync.reset();
            };

            // Useful for testing the exact text Piper will receive.
            tts.parseText = parseForSpeech;
            tts.playbackRate = PLAYBACK_RATE;

            window.tts = tts;
            window.speak = function (text) { tts.speak(text); };
            window.interruptTTS = function () { tts.interrupt(); };

            // Drain anything requested while the model was loading (never Web Speech).
            var pending = window._speechQueue.splice(0, window._speechQueue.length);
            if (pending.length) {
                console.log('[TTS] flushing', pending.length, 'queued utterance(s)');
                pending.forEach(function (utterance) { tts.speak(utterance); });
            }

            ttsProgress(100, 'Voice ready');
            console.log('[TTS] PiperTTS int8 ready.');
        } catch (err) {
            console.error('[TTS] Failed to load PiperTTS int8:', err);
            ttsProgress(100, 'Voice failed to load');
            if (window.app && typeof window.app.notify === 'function') {
                try {
                    window.app.notify('Akari Voice', 'Failed to load: ' + (err && err.message ? err.message : err), {
                        borderColors: ['#ff7a7a', '#ffb347']
                    });
                } catch (_) {}
            }
            // Keep window.speak as queue-only — still no Web Speech fallback.
            window.tts = window.tts || { isReady: false, speak: enqueueSpeak, interrupt: function () { window._speechQueue = []; } };
            window.speak = function (text) { enqueueSpeak(text); };
        }
    };

    load();
})();
