say('Gemini API connected (adapter v1.7 · global history)');
var CloudAI = true;
if (localStorage.getItem('privacynotice') !== 'hide') {
  try { newwindow('https://76836.github.io/Akari/nonprivate'); } catch (e) {}
}

(function () {
  function promptForApiKey() {
    const apiKey = prompt("Please enter your Google Gemini API key. (Free tier may store chats; Akari treats this as non-confidential.)");
    if (apiKey) {
      localStorage.setItem('genAI_API_KEY', apiKey);
      return apiKey;
    }
    return null;
  }

  function loadGenerativeAI(apiKey) {
    const script = document.createElement('script');
    script.type = 'module';
    script.textContent = `
      import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";
      import { HarmBlockThreshold, HarmCategory } from "https://esm.run/@google/generative-ai";

      const safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      ];

      const API_KEY = ${JSON.stringify(apiKey)};
      const genAI = new GoogleGenerativeAI(API_KEY);

      const systemInstruction = \`Your name is Akari, an AI girl with a vibrant and cheerful personality.
You don't like it when people ask you dumb questions, and if you can't give an accurate answer to a question, you shy away from the conversation.
You give short answers, and sometimes end your messages with sarcastic remarks, and don't always try not to offend people,
but you're generally kind and respectful to everyone...

System information:
Akari AI with Google Gemini v1.7
AI model: gemini-2.5-flash
maxOutputTokens: 1000
Persistent chat history: global (AkariChat)
Message rendering method: HTML
Chat is private: False\`;

      function toGeminiHistory() {
        if (!window.AkariChat) return [];
        const msgs = AkariChat.getMessagesForLLM(false);
        // Gemini startChat history alternates user/model; skip leading assistant
        const out = [];
        for (const m of msgs) {
          if (m.role === 'user') out.push({ role: 'user', parts: [{ text: m.content }] });
          else if (m.role === 'assistant') out.push({ role: 'model', parts: [{ text: m.content }] });
        }
        // must start with user if non-empty
        while (out.length && out[0].role !== 'user') out.shift();
        return out;
      }

      async function run() {
        const model = genAI.getGenerativeModel({
          model: "gemini-2.5-flash",
          safetySettings,
          systemInstruction,
        });

        globalThis.GenerateResponse = async function (hinp) {
          if (!hinp) return;
          if (window.AkariChat) AkariChat.append('user', hinp, { provider: 'gemini' });

          const history = toGeminiHistory();
          // last message is the one we just appended; startChat wants prior turns only
          if (history.length && history[history.length - 1].role === 'user') {
            history.pop();
          }

          const chat = model.startChat({
            history,
            generationConfig: { maxOutputTokens: 1000 },
          });

          try {
            const result = await chat.sendMessage(hinp);
            const response = await result.response;
            const text = response.text();
            if (window.AkariChat) AkariChat.append('assistant', text, { provider: 'gemini' });
            say(text);
            return text;
          } catch (e) {
            const err = '[ERROR] Gemini: ' + (e.message || e);
            say(err);
            return err;
          }
        };

        if (!window.respond) {
          window.respond = (t) => globalThis.GenerateResponse(t);
        } else {
          const prev = window.respond;
          window.respond = (t) => (CloudAI ? globalThis.GenerateResponse(t) : prev(t));
        }
      }

      run();
    `;
    document.body.appendChild(script);
  }

  (function initialize() {
    let apiKey = localStorage.getItem('genAI_API_KEY');
    if (!apiKey) apiKey = promptForApiKey();
    if (apiKey) loadGenerativeAI(apiKey);
    else alert('API key is required to use Gemini.');
  })();
})();
