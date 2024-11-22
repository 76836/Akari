(function () {
    function loadGenerativeAI(apiKey) {
        const script = document.createElement('script');
        script.type = 'module';
        script.textContent = `
        // Configuration - matching the official example exactly
        const CONFIG_PATHS = {
            'single-thread/wllama.js': '../Mukumi/esm/single-thread/wllama.js',
            'single-thread/wllama.wasm': '../Mukumi/esm/single-thread/wllama.wasm',
            'multi-thread/wllama.js': '../Mukumi/esm/multi-thread/wllama.js',
            'multi-thread/wllama.wasm': '../Mukumi/esm/multi-thread/wllama.wasm',
            'multi-thread/wllama.worker.mjs': '../Mukumi/esm/multi-thread/wllama.worker.mjs'
        };
        
        const MODEL_URL = 'https://huggingface.co/bartowski/SmolLM2-135M-Instruct-GGUF/resolve/main/SmolLM2-135M-Instruct-IQ3_M.gguf';
        const MODEL_SIZE = '90MB';

        let wllama = null;
        let chatHistory = JSON.parse(localStorage.getItem('chatHistory')) || [];
        if (!chatHistory.length) {
            chatHistory.push({
                role: 'system',
                content: \`You are Akari\`
            });
        }

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
            }).join('') + \`<|im_start|>assistant\n\`;
        }

        // Initialize Wllama with proper configuration
        document.body.onload = async () => {
            console.log(\`Loading \${MODEL_SIZE} model...\`);
            
            try {
                const { Wllama } = await import('../Mukumi/esm/index.js');
                // Initialize with both single and multi-thread configurations
                wllama = new Wllama(CONFIG_PATHS);
                
                // Load the model with specific options
                await wllama.loadModelFromUrl(MODEL_URL, {
                    numThreads: navigator.hardwareConcurrency || 4,
                    batchSize: 512,
                    contextSize: 2048
                });
                
                say(\`Model loaded (\${MODEL_SIZE}) with \${navigator.hardwareConcurrency || 4} threads\`);
            } catch (error) {
                console.error('Error loading model:', error);
            }
        };

        globalThis.GenerateResponse = async function (hinp) {
            const chatHistoryKey = 'chatHistory';
            const maxCharacters = 1000;
        
            let chatHistory = JSON.parse(localStorage.getItem(chatHistoryKey)) || [];
        
            let totalCharacters = chatHistory.reduce((acc, message) => acc + message.content.length, 0);
            while (totalCharacters > maxCharacters) {
                const removedMessage = chatHistory.shift();
                totalCharacters -= removedMessage.content.length;
            }
        
            localStorage.setItem(chatHistoryKey, JSON.stringify(chatHistory));

            const message = hinp;
            if (!message || !wllama) return;

            chatHistory.push({ role: 'user', content: message });

            try {
                const prompt = formatChatPrompt(chatHistory);
                console.log('Formatted prompt:', prompt);

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

                chatHistory.push({ role: 'assistant', content: fullResponse });
                localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
                console.log(fullResponse);
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

    (function initialize() {
        loadGenerativeAI();
    })();
})();
