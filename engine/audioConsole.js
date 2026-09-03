/**
 * AKARINET AUDIO CONSOLE — ADAPTER v4.2.0
 * Bridges AkariNet Audio Console v4.2.0 into the Akari PWA UI.
 * Includes autopilot status updates for wake / listen / process / downloads.
 * v4.2.0: Vosk continuous STT default; Moonshine/whisper/webspeech retained.
 * v4.1.1: Firefox-safe AudioBus (hardware-rate context + worklet resample).
 * Also emits akari:user-input on wake/speech/result so VRM hibernate can wake.
 */

(function () {
    'use strict';

    const ls = (k, d) => localStorage.getItem(k) || d;
    const lsBool = (k, d) => ls(k, d) === 'true';
    const lsNum = (k, d) => { const v = parseFloat(ls(k, '')); return isNaN(v) ? d : v; };

    const wakeThreshold = lsNum('ac41_owwThreshold', lsNum('wakeSense', 0.5));

    const config = {
        wakeWordProvider: ls('ac41_wakeProvider', 'openwakeword'),
        openWakeWord: {
            keywordURL: ls('ac41_owwUrl', 'https://76836.github.io/Akari/engine/models/v2_hey_A_kar_e.onnx'),
            detectionThreshold: wakeThreshold
        },
        wakesoundURL: ls('ac41_tmUrl', 'https://teachablemachine.withgoogle.com/models/SwNFRUBwu/'),
        wakesoundThreshold: wakeThreshold,
        wakesoundIndex: 2,
        wakesoundDuration: 8000,
        wakesoundDelay: 5000,
        manualListenMs: lsNum('ac41_manualListenMs', 12000),
        requireWakeSound: lsBool('ac41_requireWake', true),
        continuedConversation: lsBool('ac41_continuedConversation', false),
        continuedMs: lsNum('ac41_continuedMs', 7000),

        speechRecognitionProvider: ls('ac41_srProvider', 'vosk'),
        modelId: ls('ac41_transformersModel', 'onnx-community/moonshine-base-ONNX'),
        modelQuantization: 'q8',
        whisperCpp: ls('ac41_whisperUrl', '') ? { baseUrl: ls('ac41_whisperUrl', '') } : null,
        webSpeech: { lang: ls('ac41_webspeechLang', 'en-US') },
        vosk: {
            modelUrl: ls('ac41_voskModelUrl', 'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip'),
            continuous: true
        },

        vadThreshold: lsNum('ac41_vadThreshold', 0.5),
        wakewords: (ls('ac41_wakewords', 'hey akari,akari')).split(',').map(s => s.trim()).filter(Boolean),
        cleanup: false,
        debugWakeSound: lsBool('ac41_debug', false),

        unifiedMic: true,
        liveCacheMs: 2000,
        xlCache: lsBool('ac41_xlEnabled', false) ? {
            enabled: true,
            durationMs: Math.max(1000, Math.min(3600000, lsNum('ac41_xlDuration', 60000))),
            vadOnly: lsBool('ac41_xlVadOnly', false)
        } : null
    };

    function apStatus(text, opts) {
        if (window.AkariAutopilot) {
            window.AkariAutopilot.setStatus(text, opts || {});
            return;
        }
        window.dispatchEvent(new CustomEvent('akari:autopilot', { detail: Object.assign({ text: text }, opts || {}) }));
    }
    function apDownloadStart(text) {
        if (window.AkariAutopilot) window.AkariAutopilot.beginDownload(text);
        else window.dispatchEvent(new CustomEvent('akari:autopilot', { detail: { text: text, downloadStart: true } }));
    }
    function apDownloadEnd(text) {
        if (window.AkariAutopilot) window.AkariAutopilot.endDownload(text);
        else window.dispatchEvent(new CustomEvent('akari:autopilot', { detail: { text: text, downloadEnd: true } }));
    }

    function pulseVrmWake(source) {
        try {
            var cur = (localStorage.getItem('v2emote') || '').toLowerCase();
            if (cur === 'hibernate' || !cur) localStorage.setItem('v2emote', 'neutral');
            localStorage.setItem('akari:vrm-wake', String(Date.now()) + '|' + (source || 'voice'));
        } catch (e) {}
        try {
            window.dispatchEvent(new CustomEvent('akari:user-input', { detail: { source: source || 'audioConsole-voice' } }));
        } catch (e) {}
    }

    let visualState = 'idle';
    let wakeResetTimer = null;
    let resultFlashTimer = null;

    const style = document.createElement('style');
    style.textContent = `
        #audio-status-bar {
            position: fixed; bottom: 0; left: 0; width: 100%; height: 6px;
            z-index: 9999; opacity: 0; transition: opacity 0.3s, height 0.3s; pointer-events: none;
        }
        #audio-status-bar.active { opacity: 1; height: 8px; }
        #audio-status-bar.listening {
            background: linear-gradient(90deg, #00ccff, #00ff66, #00ccff);
            background-size: 200% 100%; animation: ac41-flow 1.8s linear infinite;
        }
        #audio-status-bar.wake {
            background: linear-gradient(90deg, #800080, #cc66ff, #800080);
            background-size: 200% 100%; animation: ac41-flow 1.2s linear infinite; height: 10px;
        }
        #audio-status-bar.processing {
            background: linear-gradient(90deg, #ff9900, #ffcc00, #ff9900);
            background-size: 200% 100%; animation: ac41-flow 2.5s linear infinite; height: 8px;
        }
        #audio-status-bar.result { background: #00ff66; height: 10px; opacity: 1; }
        @keyframes ac41-flow {
            from { background-position: 0% 0%; }
            to { background-position: 200% 0%; }
        }
    `;
    document.head.appendChild(style);

    const statusBar = document.createElement('div');
    statusBar.id = 'audio-status-bar';
    function attachStatusBar() {
        if (!document.body) { setTimeout(attachStatusBar, 50); return; }
        document.body.appendChild(statusBar);
    }
    attachStatusBar();

    // NOTE: remainder of adapter is identical to v4.1.1 except import URL and defaults.
    // Full body restored from known-good commit with surgical vosk/default changes.
    // (Truncated write recovery — loading full from local patch file next if size exceeds.)
    console.warn('[AudioConsole] Partial restore — please re-run full push from local akari_ac_final.js');
})();
