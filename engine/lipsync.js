/**
 * AkariNet lipsync bus
 * --------------------
 * TTS engines call playThrough() so we can analyse output level and publish
 * mouth openness for the VRM iframe (same origin → localStorage is enough).
 *
 * Key: localStorage 'akari:lipsync' = JSON { mouth: 0..1, t: ms }
 * Events: window 'akari:lipsync' with { mouth }
 */
(function () {
    'use strict';

    var KEY = 'akari:lipsync';
    var activeAnalyser = null;
    var activeCtx = null;
    var rafId = 0;
    var decayTimer = 0;
    var lastMouth = 0;

    function publish(mouth) {
        mouth = Math.max(0, Math.min(1, mouth));
        // Light smoothing so morphs don't jitter
        lastMouth = lastMouth * 0.35 + mouth * 0.65;
        var payload = { mouth: lastMouth, t: Date.now() };
        try {
            localStorage.setItem(KEY, JSON.stringify(payload));
        } catch (e) {}
        try {
            window.dispatchEvent(new CustomEvent('akari:lipsync', { detail: payload }));
        } catch (e) {}
    }

    function stopLoop() {
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
        }
        activeAnalyser = null;
        activeCtx = null;
        // Ease mouth closed
        clearTimeout(decayTimer);
        var steps = 0;
        (function decay() {
            lastMouth *= 0.7;
            publish(lastMouth < 0.02 ? 0 : lastMouth);
            if (lastMouth > 0.02 && steps++ < 20) {
                decayTimer = setTimeout(decay, 30);
            } else {
                lastMouth = 0;
                publish(0);
            }
        })();
    }

    function analyseLoop() {
        if (!activeAnalyser) return;
        var data = new Uint8Array(activeAnalyser.frequencyBinCount);
        activeAnalyser.getByteTimeDomainData(data);

        // RMS of waveform (0–255 centered at 128)
        var sum = 0;
        for (var i = 0; i < data.length; i++) {
            var v = (data[i] - 128) / 128;
            sum += v * v;
        }
        var rms = Math.sqrt(sum / data.length);
        // Map RMS → mouth; speech is often ~0.05–0.35
        var mouth = Math.min(1, Math.pow(rms * 3.2, 0.85));
        publish(mouth);
        rafId = requestAnimationFrame(analyseLoop);
    }

    /**
     * Route a BufferSource through an analyser, then to speakers.
     * Call instead of source.connect(ctx.destination).
     * onEnded is invoked when playback finishes (after source.onended).
     */
    function playThrough(audioContext, source, onEnded) {
        if (!audioContext || !source) {
            if (onEnded) onEnded();
            return;
        }

        try {
            if (audioContext.state === 'suspended') audioContext.resume();
        } catch (e) {}

        var analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.4;

        source.connect(analyser);
        analyser.connect(audioContext.destination);

        activeAnalyser = analyser;
        activeCtx = audioContext;
        if (!rafId) rafId = requestAnimationFrame(analyseLoop);

        var prev = source.onended;
        source.onended = function (ev) {
            try { if (typeof prev === 'function') prev.call(source, ev); } catch (e) {}
            stopLoop();
            if (onEnded) onEnded();
        };
    }

    /** Force mouth closed (interrupt). */
    function reset() {
        stopLoop();
        lastMouth = 0;
        publish(0);
    }

    window.AkariLipsync = {
        playThrough: playThrough,
        reset: reset,
        publish: publish
    };
})();
