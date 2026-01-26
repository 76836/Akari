
(function() {
    'use strict';
    
    const loadPocketTTS = async () => {
        try {
            console.log('Loading PocketTTS...');
            
            // Dynamically import the module
            const module = await import('https://76836.github.io/AkariNet-PocketTTS/AkariNet_PocketTTS.js');
            const { PocketTTS } = module;
            
            // Configuration
            const ttsSettings = {
                voiceUrl: 'https://76836.github.io/AkariNet-PocketTTS/voice.mp3',
                speed: 1.123,            
                steps: 4,                
                temperature: 1.2,       
                streaming: false
            };
            
            // Initialize TTS
            console.log('Initializing PocketTTS...');
            await window.initTTS(ttsSettings);
            
            console.log('PocketTTS loaded and ready!');
            
        } catch (error) {
            console.error('Failed to load PocketTTS:', error);
        }
    };
    
    // Expose global speak function
    window.speak = function(text) {
        if (typeof window._internalSpeak === 'function') {
            window._internalSpeak(text);
        } else {
            console.warn('PocketTTS not ready yet. Attempting to speak:', text);
            // Queue the text to speak once loaded
            if (!window._speechQueue) window._speechQueue = [];
            window._speechQueue.push(text);
        }
    };
    
    // Expose global interrupt function
    window.interruptTTS = function() {
        if (typeof window._internalInterrupt === 'function') {
            window._internalInterrupt();
        } else {
            console.warn('PocketTTS not ready yet for interruption');
        }
    };
    
    // Override initTTS to capture the internal functions
    const originalInitTTS = window.initTTS;
    window.initTTS = async function(settings) {
        const result = await originalInitTTS?.call(this, settings);
        
        // Capture the actual speak and interrupt functions
        window._internalSpeak = window.speak;
        window._internalInterrupt = window.interruptTTS;
        
        // Re-expose our wrapper functions
        window.speak = function(text) {
            window._internalSpeak(text);
        };
        
        window.interruptTTS = function() {
            window._internalInterrupt();
        };
        
        // Process any queued speech
        if (window._speechQueue && window._speechQueue.length > 0) {
            console.log('Processing queued speech...');
            window._speechQueue.forEach(text => window.speak(text));
            window._speechQueue = [];
        }
        
        return result;
    };
    
    // Auto-load
    loadPocketTTS();
})();
