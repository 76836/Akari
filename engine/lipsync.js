/**
 * AkariNet lipsync bus — amplitude → mouth openness for VRM-v2.
 * Key: localStorage 'akari:lipsync' = { mouth: 0..1, t: ms }
 */
(function () {
    'use strict';

    var KEY = 'akari:lipsync';
    var activeAnalyser = null;
    var rafId = 0;
    var frameSkip = 0;
    var lastMouth = 0;
    var decayTimer = 0;

    function publish(mouth) {
        mouth = Math.max(0, Math.min(1, mouth));
        // Soften peaks so chin does not stretch
        mouth = Math.min(0.85, mouth * 0.75);
        lastMouth = lastMouth * 0.45 + mouth * 0.55;
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
        // Run analysis every other frame — cheaper, still smooth
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
            // Gentle curve — stays in range of preset emotion mouth shapes
            var mouth = Math.min(1, Math.pow(rms * 2.4, 0.9));
            publish(mouth);
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
        analyser.smoothingTimeConstant = 0.5;

        source.connect(analyser);
        analyser.connect(audioContext.destination);

        activeAnalyser = analyser;
        frameSkip = 0;
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
        publish(0);
    }

    window.AkariLipsync = {
        playThrough: playThrough,
        reset: reset,
        publish: publish
    };
})();
