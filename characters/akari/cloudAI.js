say('Akari AI with Google Gemini. (v1.3)');

(function() {
    // Function to prompt for API key and save to local storage
    function promptForApiKey() {
        const apiKey = prompt("Please enter your Google Generative AI API key:");
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
            import { HarmBlockThreshold, HarmCategory } from "@google/generative-ai";

            const {
                GoogleGenerativeAI,
                HarmCategory,
                HarmBlockThreshold,
            } = require("@google/generative-ai");

            const API_KEY = "${apiKey}";
            const genAI = new GoogleGenerativeAI(API_KEY);

            async function run() {
                const model = genAI.getGenerativeModel({
                    model: "gemini-1.5-flash-latest",
                    systemInstruction: \`
                        Your name is Akari, an AI girl with a vibrant and cheerful personality.
                        You don't like it when people ask you dumb questions, and if you can't give an accurate answer to a question, you shy away from the conversation.
                        You give short answers, and sometimes end your messages with sarcastic remarks, and don't always try not to offend people,
                        but you're generally kind and respectful to everyone...\`,
                });

                var safetySettings = [
                    {
                      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                      threshold: HarmBlockThreshold.BLOCK_NONE,
                    },
                    {
                      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                      threshold: HarmBlockThreshold.BLOCK_NONE,
                    },
                    {
                      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                      threshold: HarmBlockThreshold.BLOCK_NONE,
                    },
                    {
                      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                      threshold: HarmBlockThreshold.BLOCK_NONE,
                    },
                  ];
                  
                const chat = model.startChat({
                    history: [],
                    safetySettings,
                    generationConfig: {
                        maxOutputTokens: 1000,
                    },
                });

                globalThis.respond = async function(hinp) {
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
