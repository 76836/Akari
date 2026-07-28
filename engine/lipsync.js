/**
 * AkariNet lipsync bus — amplitude → mouth openness for VRM-v2.
 * Key: localStorage 'akari:lipsync' = { mouth: 0..1, t: ms }
 *
 * Uses a short rolling peak (AGC) so quiet TTS and loud TTS
 * map to similar mouth openness.
 */
(function () {
    'use strict';

    var KEY = 'akari:lipsync';
    var activeAnalyser = null;
    var rafId = 0;
    var frameSkip = 0;
    var lastMouth = 0;
    var decayTimer = 0;

    // Automatic gain control state
    var peakRms = 0.08;       // slow-rising floor so first frames still move
    var PEAK_ATTACK = 0.35;   // how fast peak tracks loud speech
    var PEAK_RELEASE = 0.015; // how slowly it falls (keeps quiet engines readable)
    var NOISE_GATE = 0.012;   // ignore near-silence

    function publish(mouth) {
        mouth = Math.max(0, Math.min(1, mouth));
        lastMouth = lastMouth * 0.4 + mouth * 0.6;
        var payload = { mouth: lastMouth, t: Date.now() };
        try { localStorage.setItem(KEY, JSON.stringify(payload)); } catch (e) {}
        try {
            window.dispatchEvent(new CustomEvent('akari:lipsync', { detail: payload }));
        } catch (e) {}
    }

    function stopLoop() {
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
        activeAnalyser = null;
        clearTimeout(decayTimer);
        var steps = 0;
        (function decay() {
            lastMouth *= 0.65;
            peakRms = Math.max(0.06, peakRms * 0.92);
            publish(lastMouth < 0.02 ? 0 : lastMouth);
            if (lastMouth > 0.02 && steps++ < 16) {
                decayTimer = setTimeout(decay, 40);
            } else {
                lastMouth = 0;
                publish(0);
            }
        })();
    }

    function analyseLoop() {
        if (!activeAnalyser) return;
        frameSkip++;
        if (frameSkip % 2 === 0) {
            var data = new Uint8Array(activeAnalyser.frequencyBinCount);
            activeAnalyser.getByteTimeDomainData(data);
            var sum = 0;
            for (var i = 0; i < data.length; i++) {
                var v = (data[i] - 128) / 128;
                sum += v * v;
            }
            var rms = Math.sqrt(sum / data.length);

            // Noise gate
            if (rms < NOISE_GATE) {
                publish(lastMouth * 0.7);
            } else {
                // AGC: track recent peak, normalize RMS against it
                if (rms > peakRms) {
                    peakRms = peakRms * (1 - PEAK_ATTACK) + rms * PEAK_ATTACK;
                } else {
                    peakRms = peakRms * (1 - PEAK_RELEASE) + rms * PEAK_RELEASE;
                }
                peakRms = Math.max(0.04, Math.min(0.55, peakRms));

                var norm = rms / peakRms;          // ~0..1 relative to current voice level
                norm = Math.max(0, Math.min(1.15, norm));
                // Comfortable visual curve — not chin-stretching, not invisible
                var mouth = Math.pow(norm, 0.75);
                mouth = Math.min(1, mouth * 0.95);
                publish(mouth);
            }
        }
        rafId = requestAnimationFrame(analyseLoop);
    }

    function playThrough(audioContext, source, onEnded) {
        if (!audioContext || !source) {
            if (onEnded) onEnded();
            return;
        }
        try {
            if (audioContext.state === 'suspended') audioContext.resume();
        } catch (e) {}

        var analyser = audioContext.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.45;

        source.connect(analyser);
        analyser.connect(audioContext.destination);

        activeAnalyser = analyser;
        frameSkip = 0;
        // Soft reset peak so a new utterance re-learns level quickly
        peakRms = Math.max(0.06, peakRms * 0.5);
        if (!rafId) rafId = requestAnimationFrame(analyseLoop);

        var prev = source.onended;
        source.onended = function (ev) {
            try { if (typeof prev === 'function') prev.call(source, ev); } catch (e) {}
            stopLoop();
            if (onEnded) onEnded();
        };
    }

    function reset() {
        stopLoop();
        lastMouth = 0;
        peakRms = 0.08;
        publish(0);
    }

    window.AkariLipsync = {
        playThrough: playThrough,
        reset: reset,
        publish: publish
    };
})();
