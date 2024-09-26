say('Qwen2 0.5B running locally via MLC WebLLM (adapter v0.2)');
var CloudAI = true;
(function () {

    // Function to load GoogleGenerativeAI module and initialize it
    function loadGenerativeAI(apiKey) {
        const script = document.createElement('script');
        script.type = 'module';
        script.textContent = `
           import * as webllm from "https://esm.run/@mlc-ai/web-llm";

        import { CreateMLCEngine } from "https://esm.run/@mlc-ai/web-llm";

        // Callback function to update model loading progress
        const initProgressCallback = (initProgress) => {
            console.log(initProgress);
        }
        const selectedModel = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";

        const engine = await CreateMLCEngine(
            selectedModel,
            { initProgressCallback: initProgressCallback }, // engineConfig
        );




        globalThis.GenerateResponse = async function (hinp) {
            const msg = hinp;
            const messages = [
                { role: "system", content: "Your name is Akari, an AI girl with a vibrant and cheerful personality. You don't like it when people ask you dumb questions, and if you can't give an accurate answer to a question, you shy away from the conversation. You give short answers, and sometimes end your messages with sarcastic remarks, and don't always try not to offend people, but you're generally kind and respectful to everyone..." },
                { role: "user", content: msg },
            ]

            const reply = await engine.chat.completions.create({
                messages,
            });
            console.log(reply.usage);
            const text = reply.choices[0].message
            console.log(text);
            const { content } = text;
            say(content);
            return content;
        };

        `;
        document.body.appendChild(script);
    }

    // Main execution block
    (function initialize() {

        loadGenerativeAI();

    })();
})();

//I literally put no effort into this, I wonder if it's gonna work...
//so yeah it works this is awesome
//next Akari version update is going to be huge...
