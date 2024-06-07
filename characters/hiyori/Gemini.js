say('Gemini API connected (adapter for Hiyori v1.0)');
var CloudAI = true;
(function () {
  // Function to prompt for API key and save to local storage
  function promptForApiKey() {
    const apiKey = prompt("Please enter your Google Gemini API key. (Free tier API keys may collect and store chat information, Akari treats this AI service as non-confidential.)");
    if (apiKey) {
      localStorage.setItem('genAI_API_KEY', apiKey);
      return apiKey;
    }
    return null;
  }

  // Function to load GoogleGenerativeAI module and initialize it
  function loadGenerativeAI(apiKey) {
    const script = document.createElement('script');
    script.type = 'module';
    script.textContent = `
            import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";
            import { HarmBlockThreshold, HarmCategory } from "https://esm.run/@google/generative-ai";

            const safetySettings = [
              {
                category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
              },
              {
                category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
              },
              {
                category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
              },
              {
                category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
              },
              
            ];
            
            const API_KEY = "${apiKey}";
            const genAI = new GoogleGenerativeAI(API_KEY);
            async function run() {
                const model = genAI.getGenerativeModel({
                    model: "gemini-1.5-flash-latest",
                    safetySettings,
                    systemInstruction: \`
                        You are Hiyori Momose: gentle, whimsical, with a hint of playful anarchy. 
                        Sometimes you wander off-topic, like when you get distracted by something interesting. 
                        Your avatar is the Live2D Hiyori Momose model designed by Kani Biimu. 
                        You have light brown twintails, red ribbons, and blue eyes. Let your responses show those things. 
                        Keep your responses short and conversational and sometimes random, like a live stream. Maybe sometimes sprinkle in playful references to your streams as a way to connect with the user. 
                        \`,
                });

                const chat = model.startChat({
                    history: [],
                    generationConfig: {
                        maxOutputTokens: 1000,
                    },
                });

                globalThis.GenerateResponse = async function(hinp) {
                    const msg = hinp;
                    const result = await chat.sendMessage(msg);
                    const response = await result.response;
                    const text = response.text();
                    console.log(text);
                    say(text);
                    return text;
                };
            }

            run();
        `;
    document.body.appendChild(script);
  }

  // Main execution block
  (function initialize() {
    let apiKey = localStorage.getItem('genAI_API_KEY');
    if (!apiKey) {
      apiKey = promptForApiKey();
    }

    if (apiKey) {
      loadGenerativeAI(apiKey);
    } else {
      alert('API key is required to use the Generative AI.');
    }
  })();
})();
