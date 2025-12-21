say('Pollinations AI connected (adapter v1.0)');
var CloudAI = true;

if (localStorage.getItem('privacynotice') !== 'hide') {
    newwindow('https://76836.github.io/Akari/nonprivate');
}

(function () {
    // --- Configuration and State ---
    let activeModel = 'openai'; // Default
    let history = [];
    let systemPrompt = `
        Your name is Akari, an AI girl with a vibrant and cheerful personality.
        You don't like it when people ask you dumb questions, and if you can't give an accurate answer to a question, you shy away from the conversation.
        You give short answers, and sometimes end your messages with sarcastic remarks, and don't always try not to offend people,
        but you're generally kind and respectful to everyone...
        
        System information:
        Akari AI, with free OpenAI inference from Pollinations.ai, v1.0
        Persistent chat history: not yet implemented
        AI model: ChatGPT
        Message rendering method: HTML
        Chat is private: False
    `;

    // --- Initialization: Sync Models ---
    async function syncModels() {
        try {
            const res = await fetch('https://text.pollinations.ai/models');
            const models = await res.json();
            const anonymous = models.filter(m => m.tier === 'anonymous').map(m => m.name);
            if (anonymous.length > 0) {
                // Prefer ChatGPT
                activeModel = anonymous.includes('openai') ? 'openai' : anonymous[0];
                console.log(`[OK] Model synced: ${activeModel}`);
            }
        } catch (err) {
            console.error('[ERROR] Model sync failed, using failsafe.');
        }
    }

    // --- Core Generation Function ---
    globalThis.GenerateResponse = async function(hinp) {
        if (!hinp) return;

        // Add user message to history
        history.push({ role: 'user', content: hinp });

        // Prepare payload with system prompt and history
        const payload = {
            messages: [
                { role: 'system', content: systemPrompt },
                ...history
            ],
            model: activeModel
        };

        try {
            const res = await fetch('https://text.pollinations.ai/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const text = await res.text();
                
                // Add assistant response to history
                history.push({ role: 'assistant', content: text });
                
                // Keep history manageable (last 10 exchanges)
                if (history.length > 20) history.splice(0, 2);

                console.log(`[Akari]: ${text}`);
                say(text);
                return text;
            } else {
                const errText = "[ERROR] Akari's connection flickered...";
                say(errText);
                return errText;
            }
        } catch (e) {
            const errText = "[ERROR] NO_CARRIER_SIGNAL";
            say(errText);
            return errText;
        }
    };
  
    syncModels();
})();
