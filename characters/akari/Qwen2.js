say('Qwen2 0.5B running locally via MLC WebLLM (adapter v1.0a)');
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







async function extractAndRunJS(message) {
    const jsRegex = /{{js}}([\s\S]*?){{\/js}}/;
    const match = message.match(jsRegex);

    if (match) {
        const jsCode = match[1];
        try {
            const result = await runJSCode(jsCode);
            displayResult(result);
        } catch (err) {
            displayError(err);
        }

        // Remove the JavaScript code from the message
        var cleanedMessage = message.replace(jsRegex, '');
        console.log('Cleaned message:', cleanedMessage);
    } else {
        console.log('No JavaScript code found in the message.');
    }
    say(cleanedMessage);
};

function runJSCode(jsCode) {
    return new Promise((resolve, reject) => {
        try {
            const result = new Function(jsCode)();
            resolve(result);
        } catch (err) {
            reject(err);
        }
    });
};

function displayResult(result) {
    say('<b>SYSTEM:</b> Intelligent JS returned:\n' + result);
};

function displayError(error) {
    say('<b>SYSTEM:</b> Intelligent JS error:' + error);
};






        globalThis.GenerateResponse = async function (hinp) {
            const msg = hinp;
            const messages = [
                { role: "system", content: "Your name is Akari, an AI girl with a vibrant and cheerful personality. You don't like it when people ask you dumb questions, and if you can't give an accurate answer to a question, you shy away from the conversation. You give short answers, and sometimes end your messages with sarcastic remarks, and don't always try not to offend people, but you're generally kind and respectful to everyone...   Using {{js}} your code here {{/js}} runs the script inside the tags. Use this when requested to do things like advanced math or opening a new tab." },
                { role: "user", content: msg },
            ]

            const reply = await engine.chat.completions.create({
                messages,
            });
            console.log(reply.usage);
            const text = reply.choices[0].message
            console.log(text);
            const { content } = text;
            extractAndRunJS(content)
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
