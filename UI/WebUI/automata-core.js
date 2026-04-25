export function createAutomataRuntime() {
    const state = {
        automata: {},
        subscriptions: {},
        memory: {
            provider: 'pollinations',
            history: [],
            lastReply: '',
            settings: {
                pollinationsModel: 'openai-large',
                geminiModel: 'gemini-2.0-flash',
                maxHistory: 20,
                voice: 'default',
                automataEnabled: {
                    'pollinations.automata': true,
                    'gemini.automata': true,
                    'audio.console.automata': true,
                    'kitten.tts.automata': true,
                    'ui.automata': true
                }
            }
        }
    };

    function register(id, def) {
        state.automata[id] = {
            id,
            name: def.name || id,
            version: def.version || '0.1.0',
            description: def.description || '',
            handle: def.handle || (() => {}),
            events: def.events || []
        };
    }

    function on(eventName, automataId) {
        if (!state.subscriptions[eventName]) {
            state.subscriptions[eventName] = [];
        }
        state.subscriptions[eventName].push(automataId);
    }

    async function emit(eventName, payload) {
        const listeners = state.subscriptions[eventName] || [];
        for (const id of listeners) {
            const unit = state.automata[id];
            if (!unit) {
                continue;
            }
            await unit.handle({ eventName, payload, runtime: api });
        }
    }

    function addMessage(role, text) {
        state.memory.history.push({ role, text, time: Date.now() });
        if (state.memory.history.length > state.memory.settings.maxHistory) {
            state.memory.history = state.memory.history.slice(-state.memory.settings.maxHistory);
        }
    }

    function setProvider(provider) {
        state.memory.provider = provider;
    }

    function updateSettings(next) {
        const filtered = Object.fromEntries(
            Object.entries(next || {}).filter(([, value]) => value !== undefined)
        );
        state.memory.settings = { ...state.memory.settings, ...filtered };
    }

    const api = {
        state,
        register,
        on,
        emit,
        addMessage,
        setProvider,
        updateSettings
    };

    return api;
}
