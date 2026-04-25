export function installAudioAutomata(runtime) {
    runtime.register('audio.console.automata', {
        name: 'Audio Console Automata',
        version: '1.0.0',
        description: 'Simple automata audio console integration using browser SpeechRecognition.',
        events: ['audio.listen.start'],
        async handle({ eventName }) {
            if (!runtime.state.memory.settings.automataEnabled['audio.console.automata']) {
                return;
            }
            if (eventName !== 'audio.listen.start') {
                return;
            }

            const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!Recognition) {
                await runtime.emit('assistant.error', { message: 'SpeechRecognition is not available in this browser.' });
                return;
            }

            const rec = new Recognition();
            rec.lang = 'en-US';
            rec.maxAlternatives = 1;
            rec.interimResults = false;

            rec.onresult = async (evt) => {
                const text = evt.results?.[0]?.[0]?.transcript || '';
                if (!text.trim()) {
                    return;
                }
                runtime.addMessage('user', text);
                await runtime.emit('ui.message', { role: 'user', text });
                await runtime.emit('assistant.request', { source: 'audio.console.automata' });
            };

            rec.onerror = async () => {
                await runtime.emit('assistant.error', { message: 'Speech recognition error.' });
            };

            rec.start();
            await runtime.emit('ui.message', { role: 'system', text: 'Listening...' });
        }
    });

    runtime.on('audio.listen.start', 'audio.console.automata');

    runtime.register('kitten.tts.automata', {
        name: 'KittenTTS Automata',
        version: '1.0.0',
        description: 'Automata voice output with SpeechSynthesis fallback for KittenTTS flow.',
        events: ['audio.tts.speak'],
        async handle({ eventName, payload }) {
            if (!runtime.state.memory.settings.automataEnabled['kitten.tts.automata']) {
                return;
            }
            if (eventName !== 'audio.tts.speak') {
                return;
            }

            const text = payload?.text || runtime.state.memory.lastReply;
            if (!text) {
                return;
            }

            if (!window.speechSynthesis) {
                await runtime.emit('assistant.error', { message: 'SpeechSynthesis is not available in this browser.' });
                return;
            }

            const utterance = new SpeechSynthesisUtterance(text);
            const pref = runtime.state.memory.settings.voice;
            const voices = window.speechSynthesis.getVoices();

            if (pref && pref !== 'default') {
                const match = voices.find((v) => v.name === pref);
                if (match) {
                    utterance.voice = match;
                }
            }

            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(utterance);
        }
    });

    runtime.on('audio.tts.speak', 'kitten.tts.automata');
}
