/**
 * PiperTTS loader + natural text preprocessing + lipsync playback tap.
 * The voice model is hosted on Hugging Face.
 */
(function () {
    'use strict';

    window._speechQueue = window._speechQueue || [];

    var BASE = 'https://76836.github.io/AkariNet-PiperTTS/';
    var MODEL_URL = 'https://huggingface.co/76836-HW/AkariNet-PiperTTS/resolve/main/model.onnx';
    var PLAYBACK_RATE = 1.123;

    // SpeechT5 used roughly 50-character utterances. Piper sounds more natural
    // when it gets similarly sized chunks, so keep the target around 44 chars.
    var TARGET_CHARS = 44;
    var MAX_CHARS = 58;
    var MIN_WORDS = 2;
    var NORMAL_LENGTH_SCALE = 1.0;
    var MAX_SHORT_LENGTH_SCALE = 1.35;

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

    function shortLengthScale(text) {
        var chars = text.length;
        if (chars >= TARGET_CHARS) return NORMAL_LENGTH_SCALE;
        // Short utterances get more duration from Piper itself, rather than
        // relying on playback-rate changes. Very short utterances top out at 1.35x.
        var ratio = (TARGET_CHARS - chars) / TARGET_CHARS;
        return Math.min(MAX_SHORT_LENGTH_SCALE, 1.0 + ratio * 0.35);
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
                lengthScale: shortLengthScale(chunk),
                words: wordCount(chunk)
            };
        }).filter(function (item) {
            return item.text && item.words >= MIN_WORDS || (item.text && item.text.length > 0);
        });
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
                INFERENCE: { noise_scale: 0.667, noise_w: 0.8 }
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
                    if (tts._queue.length === 0) {
                        try {
                            window.dispatchEvent(new CustomEvent('akari:tts-end', {
                                detail: { source: 'PiperTTS' }
                            }));
                        } catch (_) {}
                    }
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

            var cfgRes = await fetch(BASE + 'config.json');
            if (!cfgRes.ok) throw new Error('Failed to load PiperTTS config: HTTP ' + cfgRes.status);
            tts._config = await cfgRes.json();

            tts._worker = new Worker(BASE + 'worker.js');

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
                var segments = parseForSpeech(text);
                if (!segments.length) return;
                if (!tts.isReady) {
                    window._speechQueue.push(text);
                    return;
                }
                tts._interrupted = false;
                ensureCtx().then(function () {
                    tts._worker.postMessage({
                        type: 'speak',
                        segments: segments,
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

            // Useful for testing the exact text Piper will receive.
            tts.parseText = parseForSpeech;
            tts.playbackRate = PLAYBACK_RATE;

            window.tts = tts;
            window.speak = function (text) { tts.speak(text); };
            window.interruptTTS = function () { tts.interrupt(); };

            if (window._speechQueue.length) {
                window._speechQueue.forEach(function (t) { tts.speak(t); });
                window._speechQueue = [];
            }

            console.log('[TTS] PiperTTS ready (natural parsing + lipsync).');
        } catch (err) {
            console.error('[TTS] Failed to load PiperTTS:', err);
        }
    };

    load();
})();
