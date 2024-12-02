// audioRecorderProcessor.js
class AudioRecorderProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        
        this.sampleRate = options.processorOptions.sampleRate;
        this.outputBufferLength = options.processorOptions.outputBufferLength;
        this.outputSampleRate = options.processorOptions.outputSampleRate;
        
        this.recording = false;
        this.buffers = [[], []];

        this.port.onmessage = (e) => {
            switch (e.data.command) {
                case 'start':
                    this.recording = true;
                    this.buffers = [[], []];
                    break;
                case 'stop':
                    this.recording = false;
                    break;
            }
        };
    }

    process(inputs, outputs) {
        const input = inputs[0];
        
        if (!this.recording) return true;

        // Store input data
        this.buffers[0].push(...input[0]);
        this.buffers[1].push(...input[1]);

        // Check if we have enough data to send
        if (this.buffers[0].length >= this.outputBufferLength) {
            const processedBuffers = [
                this.buffers[0].slice(0, this.outputBufferLength),
                this.buffers[1].slice(0, this.outputBufferLength)
            ];

            this.port.postMessage({
                command: 'newBuffer',
                data: processedBuffers
            });

            // Remove processed data
            this.buffers[0] = this.buffers[0].slice(this.outputBufferLength);
            this.buffers[1] = this.buffers[1].slice(this.outputBufferLength);
        }

        return true;
    }
}

registerProcessor('audio-recorder-processor', AudioRecorderProcessor);
