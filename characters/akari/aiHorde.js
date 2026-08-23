say('AI Horde connected (adapter v1.0 · aihorde.net)');
var CloudAI = true;

if (localStorage.getItem('privacynotice') !== 'hide') {
  try { newwindow('https://76836.github.io/Akari/nonprivate'); } catch (e) {}
}

(function () {
  const HORDE = 'https://aihorde.net/api/v2';
  // Anonymous key has lowest priority; users can set aihorde_API_KEY in localStorage
  const ANON_KEY = '0000000000';

  const systemPrompt = `Your name is Akari, an AI girl with a vibrant and cheerful personality.
You don't like it when people ask you dumb questions, and if you can't give an accurate answer to a question, you shy away from the conversation.
You give short answers, and sometimes end your messages with sarcastic remarks, and don't always try not to offend people,
but you're generally kind and respectful to everyone...

System information:
Akari AI · AI Horde v1.0
Persistent chat history: global (AkariChat)
Message rendering method: HTML
Chat is private: False (community workers)`;

  function getKey() {
    return localStorage.getItem('aihorde_API_KEY') ||
           localStorage.getItem('horde_API_KEY') ||
           ANON_KEY;
  }

  function getModel() {
    return localStorage.getItem('aihorde_model') || 'koboldcpp/MythoMax-L2-13B';
  }

  function buildPrompt(userText) {
    const msgs = window.AkariChat ? AkariChat.getMessagesForLLM(true) : [];
    let prompt = systemPrompt + '\n\n';
    msgs.forEach(m => {
      if (m.role === 'system') return;
      if (m.role === 'user') prompt += 'User: ' + m.content + '\n';
      else if (m.role === 'assistant') prompt += 'Akari: ' + m.content + '\n';
    });
    // current turn already appended by caller; if not, add it
    if (!msgs.length || msgs[msgs.length - 1].content !== userText) {
      prompt += 'User: ' + userText + '\n';
    }
    prompt += 'Akari:';
    return prompt;
  }

  async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  globalThis.GenerateResponse = async function (hinp) {
    if (!hinp) return;
    if (window.AkariChat) AkariChat.append('user', hinp, { provider: 'aihorde' });

    const prompt = buildPrompt(hinp);
    const body = {
      prompt,
      models: [getModel()],
      trusted_workers: false,
      slow_workers: true,
      n: 1,
      params: {
        max_context_length: 2048,
        max_length: 220,
        temperature: 0.8,
        top_p: 0.9,
        rep_pen: 1.1
      }
    };

    try {
      const submit = await fetch(HORDE + '/generate/text/async', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': getKey(),
          'Client-Agent': 'AkariNet:2.6:github.com/76836/Akari'
        },
        body: JSON.stringify(body)
      });

      if (!submit.ok) {
        const errBody = await submit.text().catch(() => '');
        const errText = '[ERROR] AI Horde submit failed (' + submit.status + '). ' +
          (errBody.slice(0, 120) || 'Try again or set aihorde_API_KEY / aihorde_model.');
        say(errText);
        return errText;
      }

      const job = await submit.json();
      const jobId = job.id;
      if (!jobId) {
        say('[ERROR] AI Horde returned no job id.');
        return;
      }

      // poll status
      let text = null;
      for (let i = 0; i < 90; i++) {
        await sleep(2000);
        const st = await fetch(HORDE + '/generate/text/status/' + jobId, {
          headers: {
            'apikey': getKey(),
            'Client-Agent': 'AkariNet:2.6:github.com/76836/Akari'
          }
        });
        if (!st.ok) continue;
        const status = await st.json();
        if (status.faulted) {
          say('[ERROR] AI Horde job faulted.');
          return;
        }
        if (status.done && status.generations && status.generations.length) {
          text = status.generations[0].text || status.generations[0].content;
          break;
        }
        if (i === 0 || i % 5 === 0) {
          const q = status.queue_position != null ? ' (queue #' + status.queue_position + ')' : '';
          if (typeof typing === 'function') typing('Akari' + q);
          else if (window.app?.ui?.setTyping) app.ui.setTyping('Akari' + q);
        }
      }

      if (!text) {
        const errText = '[ERROR] AI Horde timed out waiting for a worker.';
        say(errText);
        return errText;
      }

      text = String(text).replace(/<\/?s>|<\|.*?\|>/g, '').trim();
      if (window.AkariChat) AkariChat.append('assistant', text, { provider: 'aihorde' });
      say(text);
      return text;
    } catch (e) {
      const errText = '[ERROR] AI Horde: ' + (e.message || e);
      say(errText);
      return errText;
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
