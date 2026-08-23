var CloudAI = true;

(function () {
  function getAutoServerDetails() {
    try {
      const servers = JSON.parse(localStorage.getItem('lcpp_servers') || '[]');
      return servers.find(s => s.online) || null;
    } catch (e) {
      return null;
    }
  }

  const server = getAutoServerDetails();

  if (server) {
    say(`<i>(v1.4) Connected to llama.cpp server running: <b>${server.model}</b></i>`);
  } else {
    say('<i>⚠️ No compatible Llama.cpp server found.</i>');
    CloudAI = false;
  }

  const systemPrompt = `Your name is Akari, an AI girl with a vibrant and cheerful personality.
You don't like it when people ask you dumb questions, and if you can't give an accurate answer to a question, you shy away from the conversation.
You give short answers, and sometimes end your messages with sarcastic remarks, and don't always try not to offend people,
but you're generally kind and respectful to everyone...

System information:
Akari AI with Llama.cpp v1.4
maxOutputTokens: 1000
Persistent chat history: global (AkariChat)
Message rendering method: HTML
Chat is private: True`;

  function ensureSystem() {
    if (!window.AkariChat) return;
    const msgs = AkariChat.getMessagesForLLM(true);
    if (!msgs.some(m => m.role === 'system')) {
      AkariChat.append('system', systemPrompt, { provider: 'lcpp' });
    }
  }

  globalThis.GenerateResponse = async function (hinp) {
    if (!server) {
      say('<i>⚠️ Cannot generate response: No server connected.</i>');
      return;
    }
    if (!hinp) return;

    ensureSystem();
    if (window.AkariChat) AkariChat.append('user', hinp, { provider: 'lcpp' });

    const messages = window.AkariChat
      ? AkariChat.getMessagesForLLM(true)
      : [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: hinp }
        ];

    try {
      const res = await fetch(`${server.url}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'local',
          messages,
          max_tokens: 1000,
          stream: false
        })
      });
      const data = await res.json();
      let text = data?.choices?.[0]?.message?.content;

      if (!text) {
        say('<i>⚠️ Received an empty or unexpected response.</i>');
        return;
      }

      text = text.replace(/<\/?s>|<\|end(?:_of_turn|_of_text)?\|>|<\|eot_id\|>/g, '').trim();

      if (window.AkariChat) AkariChat.append('assistant', text, { provider: 'lcpp' });
      say(text);
      return text;
    } catch (err) {
      say(`<i>⚠️ Connection error: ${err.message}</i>`);
    }
  };

  if (!window.respond) {
    window.respond = function (t) { return globalThis.GenerateResponse(t); };
  } else {
    const prev = window.respond;
    window.respond = function (t) {
      if (CloudAI) return globalThis.GenerateResponse(t);
      return prev(t);
    };
  }
})();
