var CloudAI = true;

(function () {
  const DEFAULT_SYSTEM_PROMPT = `Your name is Akari, an AI girl with a vibrant and cheerful personality.
You don't like it when people ask you dumb questions, and if you can't give an accurate answer to a question, you shy away from the conversation.
You give short answers, and sometimes end your messages with sarcastic remarks, and don't always try not to offend people,
but you're generally kind and respectful to everyone...

System information:
Akari AI with Llama.cpp
Persistent chat history: global (AkariChat)
Message rendering method: HTML
Chat is private: True`;

  const TOOLS_APPENDIX = `

Tools (AkariNet Actions):
You can call tools. When you need one, output exactly:
<action>tool_name</action>
<action_input>arguments here</action_input>
If you are unsure which tools exist, call:
<action>tool_search</action>
<action_input></action_input>
Tool results will be returned to you as:
<tool_response>
...result...
</tool_response>
Use tools when they help (time, search, apps, reminders, etc.). Do not invent tool names; use tool_search first if needed.`;

  function getAutoServerDetails() {
    try {
      const servers = JSON.parse(localStorage.getItem('lcpp_servers') || '[]');
      return servers.find(s => s.online) || null;
    } catch (e) {
      return null;
    }
  }

  function actionsEnabled() {
    const v = localStorage.getItem('akari_actions_enabled');
    return v === null || v === '1' || v === 'true';
  }

  function getSystemPrompt() {
    const saved = localStorage.getItem('lcpp_system_prompt');
    const base = (saved && saved.trim()) ? saved.trim() : DEFAULT_SYSTEM_PROMPT;
    if (actionsEnabled()) return base + TOOLS_APPENDIX;
    return base;
  }

  const server = getAutoServerDetails();

  if (server) {
    say(`<i>(v1.5) Connected to llama.cpp server running: <b>${server.model}</b></i>`);
  } else {
    say('<i>⚠️ No compatible Llama.cpp server found.</i>');
    CloudAI = false;
  }

  let _lastPromptRev = null;

  function ensureSystem() {
    if (!window.AkariChat) return;
    const prompt = getSystemPrompt();
    const rev = localStorage.getItem('lcpp_system_prompt_rev') || prompt;
    const msgs = AkariChat.getMessagesForLLM(true);
    const hasSystem = msgs.some(m => m.role === 'system');

    // Refresh system message when prompt settings change
    if (hasSystem && _lastPromptRev !== null && _lastPromptRev === rev) return;

    if (typeof AkariChat.replaceSystem === 'function') {
      AkariChat.replaceSystem(prompt, { provider: 'lcpp' });
    } else if (typeof AkariChat.setSystem === 'function') {
      AkariChat.setSystem(prompt, { provider: 'lcpp' });
    } else if (typeof AkariChat.clearRole === 'function') {
      AkariChat.clearRole('system');
      AkariChat.append('system', prompt, { provider: 'lcpp' });
    } else {
      // Fallback: append only if missing; otherwise leave history and override at request time
      if (!hasSystem) AkariChat.append('system', prompt, { provider: 'lcpp' });
    }
    _lastPromptRev = rev;
  }

  function messagesForRequest(hinp) {
    const prompt = getSystemPrompt();
    if (window.AkariChat) {
      ensureSystem();
      const msgs = AkariChat.getMessagesForLLM(true).map(m => ({ role: m.role, content: m.content }));
      // Always force current system prompt on the wire
      const withoutSys = msgs.filter(m => m.role !== 'system');
      return [{ role: 'system', content: prompt }].concat(withoutSys);
    }
    return [
      { role: 'system', content: prompt },
      { role: 'user', content: hinp }
    ];
  }

  globalThis.GenerateResponse = async function (hinp) {
    if (!server) {
      say('<i>⚠️ Cannot generate response: No server connected.</i>');
      return;
    }
    if (!hinp) return;

    if (window.AkariChat) AkariChat.append('user', hinp, { provider: 'lcpp' });

    const messages = messagesForRequest(hinp);

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
