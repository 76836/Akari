say('<em>SmolLM2-135M-Instruct-GGUF on WLlama (adapter v1.0)<em>');
function postMessages(messages) {
    messages.forEach(message => {
        if (message.role === "user") {
            bubble_incoming(message.content);
        } else if (message.role === "assistant") {
            bubble(message.content);
        }
    });
};
let chatHistory = JSON.parse(localStorage.getItem('chatHistory')) || [];

// change the chat history key here too

postMessages(chatHistory);
//loadscreen('restored chat history');
var CloudAI = true;
(function () {

    function loadGenerativeAI(apiKey) {
        const script = document.createElement('script');
        script.type = 'module';
        script.textContent = `

        // Configuration
        const CONFIG_PATHS = {
            'single-thread/wllama.js': '../Mukumi/esm/single-thread/wllama.js',
            'single-thread/wllama.wasm': '../Mukumi/esm/single-thread/wllama.wasm'
        };
        
        
        const MODEL_URL = 'https://huggingface.co/bartowski/SmolLM2-135M-Instruct-GGUF/resolve/main/SmolLM2-135M-Instruct-Q8_0.gguf';
        const MODEL_SIZE = '145MB';


        let wllama = null;
        
        // Load chat history from localStorage
        let chatHistory = JSON.parse(localStorage.getItem('chatHistory')) || [];
        if (!chatHistory.length) {
            // Initialize with system message if empty
            chatHistory.push({
                role: 'system',
                content: systemPrompt.value
            });
        }

        // Format chat history for the model
        function formatChatPrompt(messages) {
            return messages.map(msg => {
                if (msg.role === 'system') {
                    return \`<|im_start|>system\n\${msg.content}<|im_end|>\n\`;
                } else if (msg.role === 'user') {
                    return \`<|im_start|>user\n\${msg.content}<|im_end|>\n\`;
                } else if (msg.role === 'assistant') {
                    return \`<|im_start|>assistant\n\${msg.content}<|im_end|>\n\`;
                }
                return '';
            }).join('') + '<|im_start|>assistant\n';
        }

        // Initialize Wllama and load model
        body.onload = async () => {
            console.log(\`Loading \${MODEL_SIZE} model...\`);
            
            try {
                const { Wllama } = await import('../Mukumi/esm/index.js');
                wllama = new Wllama(CONFIG_PATHS);
                await wllama.loadModelFromUrl(MODEL_URL);
                
                say(\`Model loaded (\${MODEL_SIZE})\`);
            } catch (error) {
                console.error('Error loading model:', error);
            }
        };



        globalThis.GenerateResponse = async function (hinp) {
            const chatHistoryKey = 'chatHistory';
            const maxCharacters = 1000; // Set your desired character limit here
        
            // Retrieve chat history from localStorage
            let chatHistory = JSON.parse(localStorage.getItem(chatHistoryKey)) || [];
        
            // Ensure chat history does not exceed maxCharacters
            let totalCharacters = chatHistory.reduce((acc, message) => acc + message.content.length, 0);
            while (totalCharacters > maxCharacters) {
                const removedMessage = chatHistory.shift();
                totalCharacters -= removedMessage.content.length;
            }
        
            // Save updated chat history back to localStorage
            localStorage.setItem(chatHistoryKey, JSON.stringify(chatHistory));

            const message = hinp;
            if (!message || !wllama) return;

            // Add user message
            chatHistory.push({ role: 'user', content: message });

            try {
                // Format the entire conversation history
                const prompt = formatChatPrompt(chatHistory);
                console.log('Formatted prompt:', prompt); // For debugging

                // Get AI response with streaming
                let fullResponse = '';
                await wllama.createCompletion(prompt, {
                    nPredict: 512,
                    sampling: {
                        temp: 0.7,
                        top_k: 40,
                        top_p: 0.9,
                    },
                    stopPrompts: ['<|im_end|>', '<|im_start|>'],
                    onNewToken: (token, piece, currentText) => {
                        fullResponse = currentText;
                        
                    },
                });

                // Save the complete response
                chatHistory.push({ role: 'assistant', content: fullResponse });
                localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
                console.log(fullResponse);
                const { content } = fullResponse;
                say(fullResponse);
                return fullResponse;
            } catch (error) {
                console.error('Error:', error);
                say('Error generating response');
            }
        }






        `;
        document.body.appendChild(script);
    }

    // Main execution block
    (function initialize() {

        loadGenerativeAI();

    })();
})();
