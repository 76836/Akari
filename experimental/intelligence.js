localStorage.removeItem('intelligence46923');
function postMessages(messages) {
    messages.forEach(message => {
        if (message.role === "user") {
            bubble_incoming(message.content);
        } else if (message.role === "assistant") {
            bubble(message.content);
        }
    });
};
let chatHistory = JSON.parse(localStorage.getItem('intelligence46923')) || [];

// change the chat history key here too

showAlert('wait for the intelligence to load...');
var CloudAI = true;
(function () {

    function loadGenerativeAI(apiKey) {
        const script = document.createElement('script');
        script.type = 'module';
        script.textContent = `
           import * as webllm from "https://esm.run/@mlc-ai/web-llm";

        import { CreateMLCEngine } from "https://esm.run/@mlc-ai/web-llm";
        
function done(obj) {
    const searchWord = "finish";
    const lowerCaseSearchWord = searchWord.toLowerCase();

    for (let key in obj) {
        if (obj.hasOwnProperty(key)) {
            const value = obj[key].toString().toLowerCase();
            if (value.includes(lowerCaseSearchWord)) {
                return true;
            }
        }
    }
    return false;
};

        // Callback function to update model loading progress
        const initProgressCallback = (initProgress) => {
            console.log(initProgress);
            loadscreen(initProgress[0]);
            if (done(initProgress)) {
            showAlert('SYSTEM: Llama 3.2 finished loading.');
            };
        }
        const selectedModel = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

        const engine = await CreateMLCEngine(
            selectedModel,
            { initProgressCallback: initProgressCallback }, // engineConfig
        );




        globalThis.GenerateResponse = async function (hinp) {
    const msg = hinp;
    const timestamp = new Date().toISOString();
    const chatHistoryKey = 'intelligence46923';
    const maxCharacters = 1000; // Set your desired character limit here

    // Retrieve chat history from localStorage
    let chatHistory = JSON.parse(localStorage.getItem(chatHistoryKey)) || [];

    // Add new user message
    chatHistory.push({ role: "user", content: msg });

    // Ensure chat history does not exceed maxCharacters
    let totalCharacters = chatHistory.reduce((acc, message) => acc + message.content.length, 0);
    while (totalCharacters > maxCharacters) {
        const removedMessage = chatHistory.shift();
        totalCharacters -= removedMessage.content.length;
    }

    // Save updated chat history back to localStorage
    localStorage.setItem(chatHistoryKey, JSON.stringify(chatHistory));

    // Prepare messages for the AI model
    const messages = [
        { role: "system", content: "You are a computer program named intelligence, everything you say is inputted run as JavaScript and the result is given to you, your ultimate goal is to  follow the instruction given to you in the first message, after you are finished, say exit." },
        ...chatHistory
    ];

    // Log the entire chat history
    console.log(JSON.stringify(chatHistory, null, 2));
    
    // Get AI response
    const reply = await engine.chat.completions.create({ messages });
    console.log(reply.usage);
    const text = reply.choices[0].message;
    console.log(text);
    const { content } = text;
    say(content);

    // Add AI response to chat history
    chatHistory.push({ role: "assistant", content });

    // Save updated chat history back to localStorage
    localStorage.setItem(chatHistoryKey, JSON.stringify(chatHistory));

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
