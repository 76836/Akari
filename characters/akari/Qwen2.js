say('Qwen2 0.5B running locally via MLC WebLLM (adapter v0.1)');
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
                { role: "system", content: "You are a helpful AI assistant named Akari." },
                { role: "user", content: msg },
            ]

            const reply = await engine.chat.completions.create({
                messages,
            });
            console.log(reply.choices[0].message);
            console.log(reply.usage);
            const text = reply
            console.log(text);
            say(text);
            return text;
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
