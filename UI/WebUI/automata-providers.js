function makeBody(messages, model) {
    return {
        model,
        messages: messages.map((item) => ({
            role: item.role,
            content: item.text
        }))
    };
}

async function requestPollinations(runtime) {
    const body = makeBody(runtime.state.memory.history, runtime.state.memory.settings.pollinationsModel);
    const response = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        throw new Error('Pollinations request failed');
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content || 'No response text from Pollinations.';
}

async function requestGemini(runtime) {
    const key = localStorage.getItem('webui.gemini.key') || '';
    if (!key) {
        throw new Error('Gemini key missing. Add it in Automata Settings.');
    }

    const prompt = runtime.state.memory.history
        .map((item) => `${item.role.toUpperCase()}: ${item.text}`)
        .join('\n');

    const model = runtime.state.memory.settings.geminiModel;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
        })
    });

    if (!response.ok) {
        throw new Error('Gemini request failed');
    }

    const data = await response.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response text from Gemini.';
}

export function installProviderAutomata(runtime) {
    runtime.register('pollinations.automata', {
        name: 'Pollinations Automata',
        version: '1.0.0',
        description: 'Automata wrapper around Pollinations AI text endpoint.',
        events: ['assistant.request'],
        async handle({ eventName }) {
            if (!runtime.state.memory.settings.automataEnabled['pollinations.automata']) {
                return;
            }
            if (eventName !== 'assistant.request' || runtime.state.memory.provider !== 'pollinations') {
                return;
            }

            try {
                const text = await requestPollinations(runtime);
                runtime.state.memory.lastReply = text;
                runtime.addMessage('assistant', text);
                await runtime.emit('assistant.reply', { text, provider: 'pollinations' });
            } catch (error) {
                await runtime.emit('assistant.error', { message: error.message });
            }
        }
    });

    runtime.on('assistant.request', 'pollinations.automata');

    runtime.register('gemini.automata', {
        name: 'Gemini Automata',
        version: '1.0.0',
        description: 'Automata wrapper around Gemini generateContent API.',
        events: ['assistant.request'],
        async handle({ eventName }) {
            if (!runtime.state.memory.settings.automataEnabled['gemini.automata']) {
                return;
            }
            if (eventName !== 'assistant.request' || runtime.state.memory.provider !== 'gemini') {
                return;
            }

            try {
                const text = await requestGemini(runtime);
                runtime.state.memory.lastReply = text;
                runtime.addMessage('assistant', text);
                await runtime.emit('assistant.reply', { text, provider: 'gemini' });
            } catch (error) {
                await runtime.emit('assistant.error', { message: error.message });
            }
        }
    });

    runtime.on('assistant.request', 'gemini.automata');
}
