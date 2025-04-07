say('<em>Gemma 3 1B running locally (adapter v1.1 beta)<em>');
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
loadscreen('restored chat history');
var CloudAI = true;
(function () {

    function loadGenerativeAI() {
        const script = document.createElement('script');
        script.type = 'module';
        script.textContent = `

import { FilesetResolver, LlmInference } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai';

async function loadModelFromCache() {
    const MODEL_URL = 'https://huggingface.co/K4N4T/gemma3-1B-it-int4.task/resolve/main/gemma3-1B-it-int4.task';
    const MODEL_CACHE = 'model-cache-v1';

    try {
        // Check cache first
        const cache = await caches.open(MODEL_CACHE);
        let modelResponse = await cache.match(MODEL_URL);

        if (!modelResponse) {
            const userConsent = confirm(
                'The model needs to be downloaded (557 MB). Continue?'
            );
            
            if (!userConsent) {
                throw new Error('Model loading canceled by user');
            }

            // Download model
            modelResponse = await fetch(MODEL_URL);
            if (!modelResponse.ok) {
                throw new Error(\`Download failed: \${modelResponse.statusText}\`);
            }

            // Cache the response
            await cache.put(MODEL_URL, modelResponse.clone());
        }

        // Create a blob URL that the inference engine can use
        const modelBlob = await modelResponse.blob();
        const modelBlobUrl = URL.createObjectURL(modelBlob);

        // Clean up the blob URL when the page unloads
        window.addEventListener('unload', () => URL.revokeObjectURL(modelBlobUrl));

        return modelBlobUrl;
    } catch (error) {
        console.error('Cache error:', error);
        alert('Failed to load model: ' + error.message);
        throw error;
    }
}

// Use the blob URL for the model
const modelFileName = await loadModelFromCache();

var gemmaCompletion = '';


function displayPartialResults(partialResults, complete) {
    gemmaCompletion += partialResults;

    if (complete) {
        if (!gemmaCompletion) {
            gemmaCompletion = 'Result is empty';
        }
    }
}

/**
 * Main function to run LLM Inference.
 */

const genaiFileset = await FilesetResolver.forGenAiTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm');
let llmInference;
async function gemmaComplete(compprompt) {
    return new Promise((resolve, reject) => {
        gemmaCompletion = ''; // Reset gemmaCompletion for each new response
        llmInference.generateResponse(compprompt, (partialResults, complete) => {
            gemmaCompletion += partialResults;

            if (complete) {
                if (!gemmaCompletion) {
                    gemmaCompletion = 'Result is empty';
                }
                resolve(gemmaCompletion); // Resolve the promise when generation is complete
            }
        });
    });
}
LlmInference.createFromOptions(genaiFileset, {
    baseOptions: { modelAssetPath: modelFileName },
    maxTokens: 2048,  // The maximum number of tokens (input tokens + output
    //                  // tokens) the model handles.
    // randomSeed: 1,   // The random seed used during text generation.
    // topK: 1,  // The number of tokens the model considers at each step of
    //           // generation. Limits predictions to the top k most-probable
    //           // tokens. Setting randomSeed is required for this to make
    //           // effects.
    // temperature:
    //     1.0,  // The amount of randomness introduced during generation.
    //           // Setting randomSeed is required for this to make effects.
})
    .then(llm => {
        llmInference = llm;
        globalThis.alive = true; // Set alive to true when the model is loaded
        say('Model loaded successfully!');
    })
    .catch(() => {
        alert('Failed to initialize the task.');
    });

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
            return \`<start_of_turn>user\n\${msg.content}<end_of_turn>\n<start_of_turn>model\n\${"Hi! I'm Akari, what's up?"}<end_of_turn>\n\`;
        } else if (msg.role === 'user') {
            return \`<start_of_turn>user\n\${msg.content}<end_of_turn>\n\`;
        } else if (msg.role === 'assistant') {
            return \`<start_of_turn>model\n\${msg.content}<end_of_turn>\n\`;
        }
        return '';
    }).join('') + \`<start_of_turn>model\n\`;
}

globalThis.GenerateResponse = async function (hinp) {

    const chatHistoryKey = 'chatHistory';
    const maxCharacters = 512;
    const systemPrompt = {
        role: 'system',
        content: \`Your name is Akari, an AI girl with a vibrant and cheerful personality.
                        You don't like it when people ask you dumb questions, and if you can't give an accurate answer to a question, you shy away from the conversation.
                        You give short answers, and sometimes end your messages with sarcastic remarks, and don't always try not to offend people,
                        but you're generally kind and respectful to everyone...\`
    };

    let chatHistory = JSON.parse(localStorage.getItem(chatHistoryKey)) || [];

    // Calculate the total characters including the system prompt
    let totalCharacters = systemPrompt.content.length + chatHistory.reduce((acc, message) => acc + message.content.length, 0);

    // Trim chat history to fit within the character limit
    while (totalCharacters > maxCharacters) {
        const removedMessage = chatHistory.shift();
        totalCharacters -= removedMessage.content.length;
    }

    localStorage.setItem(chatHistoryKey, JSON.stringify(chatHistory));

    const message = hinp;
    if (!message || !alive) return; // replaced with check for gemma3 instead of wllama

    chatHistory.push({ role: 'user', content: message });

    try {
        // Prepend the system prompt to the chat history
        const prompt = formatChatPrompt([systemPrompt, ...chatHistory]);
        console.log('Formatted prompt:', prompt);

        const fullResponse = await gemmaComplete(prompt); // Wait for the complete response

        chatHistory.push({ role: 'assistant', content: fullResponse });
        localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
        console.log(fullResponse);
        say(fullResponse);
        return fullResponse;
    } catch (error) {
        console.error('Error:', error);
        say('Error generating response');
    }
};


        `;
        document.body.appendChild(script);
    }

    // Main execution block
    (function initialize() {

        loadGenerativeAI();

    })();
})();
