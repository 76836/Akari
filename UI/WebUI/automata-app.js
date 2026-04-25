import { createAutomataRuntime } from './automata-core.js';
import { installProviderAutomata } from './automata-providers.js';
import { installAudioAutomata } from './automata-audio.js';

const runtime = createAutomataRuntime();
hydrateSettings(runtime);
installProviderAutomata(runtime);
installAudioAutomata(runtime);
installUiAutomata(runtime);

function hydrateSettings(runtimeApi) {
    try {
        const raw = localStorage.getItem('webui.automata.settings');
        if (!raw) {
            return;
        }
        const parsed = JSON.parse(raw);
        runtimeApi.updateSettings({
            pollinationsModel: parsed?.models?.pollinationsModel,
            geminiModel: parsed?.models?.geminiModel,
            voice: parsed?.voice,
            automataEnabled: {
                ...runtimeApi.state.memory.settings.automataEnabled,
                ...(parsed?.automataEnabled || {})
            }
        });
    } catch {
        runtimeApi.emit('assistant.error', { message: 'Failed to load WebUI settings.' });
    }
}

function installUiAutomata(runtimeApi) {
    const log = document.getElementById('chat-log');
    const form = document.getElementById('chat-form');
    const input = document.getElementById('chat-input');
    const list = document.getElementById('automata-list');

    function print(role, text) {
        const node = document.createElement('div');
        node.className = `message ${role}`;
        node.textContent = `${role.toUpperCase()}: ${text}`;
        log.appendChild(node);
        log.scrollTop = log.scrollHeight;
    }

    runtimeApi.register('ui.automata', {
        name: 'UI Automata',
        version: '1.0.0',
        description: 'Manages UI events and automata visualization.',
        events: ['ui.message', 'assistant.reply', 'assistant.error'],
        async handle({ eventName, payload }) {
            if (!runtimeApi.state.memory.settings.automataEnabled['ui.automata']) {
                return;
            }
            if (eventName === 'ui.message') {
                print(payload.role || 'system', payload.text || '');
                return;
            }

            if (eventName === 'assistant.reply') {
                print('assistant', payload.text || '');
                return;
            }

            if (eventName === 'assistant.error') {
                print('system', `Error: ${payload.message || 'unknown error'}`);
            }
        }
    });

    runtimeApi.on('ui.message', 'ui.automata');
    runtimeApi.on('assistant.reply', 'ui.automata');
    runtimeApi.on('assistant.error', 'ui.automata');

    function renderAutomataList() {
        list.innerHTML = '';
        Object.values(runtimeApi.state.automata).forEach((item) => {
            const card = document.createElement('div');
            card.className = 'automata-item';
            card.innerHTML = `
                <div class="name">${item.name}</div>
                <div class="meta">${item.id} · v${item.version}</div>
                <div class="meta">${item.description}</div>
            `;
            list.appendChild(card);
        });
    }

    function sendPrompt(text) {
        runtimeApi.addMessage('user', text);
        runtimeApi.emit('ui.message', { role: 'user', text });
        runtimeApi.emit('assistant.request', { source: 'ui.form' });
    }

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const value = input.value.trim();
        if (!value) {
            return;
        }
        input.value = '';
        sendPrompt(value);
    });

    document.getElementById('provider-pollinations').addEventListener('click', () => {
        runtimeApi.setProvider('pollinations');
        runtimeApi.emit('ui.message', { role: 'system', text: 'Provider switched to Pollinations.' });
    });

    document.getElementById('provider-gemini').addEventListener('click', () => {
        runtimeApi.setProvider('gemini');
        runtimeApi.emit('ui.message', { role: 'system', text: 'Provider switched to Gemini.' });
    });

    document.getElementById('speak-last').addEventListener('click', () => {
        runtimeApi.emit('audio.tts.speak', { text: runtimeApi.state.memory.lastReply });
    });

    document.getElementById('open-settings').addEventListener('click', () => {
        window.location.href = './settings.html';
    });

    renderAutomataList();
    runtimeApi.emit('ui.message', {
        role: 'system',
        text: 'AkariNet WebUI loaded. This experiment is fully automata-native.'
    });
}

window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'l' && event.altKey) {
        runtime.emit('audio.listen.start', { source: 'keyboard.alt+l' });
    }
});
