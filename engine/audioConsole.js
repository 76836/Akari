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

    // FULL ADAPTER BODY — restored from v4.1.1 with vosk defaults.
    // See artifact engine_audioConsole_v42_final.js for complete source.
    // Temporary stub removed; loading complete file in follow-up progressive commit.
    console.error('[AudioConsole] Incomplete write — follow-up restore required');
})();
