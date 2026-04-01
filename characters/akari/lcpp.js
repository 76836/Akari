var CloudAI = true;

(function () {
  // --- Auto-select server and return details ---
  function getAutoServerDetails() {
    try {
      const servers = JSON.parse(localStorage.getItem('lcpp_servers') || '[]');
      return servers.find(s => s.online) || null;
    } catch (e) {
      return null;
    }
  }

  const server = getAutoServerDetails();
  
  // Notify the user of the connected model immediately
  if (server) {
    say(`<i>Connected to llama.cpp server running: <b>${server.model}</b></i>`);
  } else {
    say('<i>⚠️ No compatible Llama.cpp server found.</i>');
    CloudAI = false;
  }

   const systemPrompt = `Your name is Akari, an AI girl with a vibrant and cheerful personality.
You don't like it when people ask you dumb questions, and if you can't give an accurate answer to a question, you shy away from the conversation.
You give short answers, and sometimes end your messages with sarcastic remarks, and don't always try not to offend people,
but you're generally kind and respectful to everyone...

System information (in case you need it):
Akari AI with Llama.cpp v1.2
maxOutputTokens: 1000
Persistent chat history: session only
Message rendering method: HTML
Chat is private: True`;
  const history = [{ role: 'system', content: systemPrompt }];

  globalThis.GenerateResponse = async function (hinp) {
    if (!server) {
      say('<i>⚠️ Cannot generate response: No server connected.</i>');
      return;
    }

    history.push({ role: 'user', content: hinp });

    try {
      const res = await fetch(`${server.url}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'local',
          messages: history,
          max_tokens: 1000,
          stream: false
        })
      });
      const data = await res.json();
      let text = data?.choices?.[0]?.message?.content;

      if (!text) {
        say('<i>⚠️ Received an empty or unexpected response.</i>');
        history.pop();
        return;
      }

      // Remove stop tokens
      text = text.replace(/<\/?s>|<\|end(?:_of_turn|_of_text)?\|>/g, '').trim();

      history.push({ role: 'assistant', content: text });
      say(text);
      return text;
    } catch (err) {
      say(`<i>⚠️ Connection error: ${err.message}</i>`);
      history.pop();
    }
  };
})();
