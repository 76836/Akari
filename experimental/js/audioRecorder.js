(function(window) {
    const AUDIO_RECORDER_WORKER = 'js/audioRecorderWorker.js';
    
    class AudioRecorder {
        constructor(source, cfg) {
            this.consumers = [];
            const config = cfg || {};
            this.errorCallback = config.errorCallback || function() {};
            this.inputBufferLength = config.inputBufferLength || 4096;
            this.outputBufferLength = config.outputBufferLength || 4000;
            this.context = source.context;
            this.recording = false;

            this.initializeAudioWorklet(source, config);
        }

        async initializeAudioWorklet(source, config) {
            try {
                // Register the audio worklet processor
                await this.context.audioWorklet.addModule('js/audioRecorderProcessor.js');

                // Create AudioWorkletNode
                this.node = new AudioWorkletNode(this.context, 'audio-recorder-processor', {
                    processorOptions: {
                        sampleRate: this.context.sampleRate,
                        outputBufferLength: this.outputBufferLength,
                        outputSampleRate: (config.outputSampleRate || 16000)
                    }
                });

                // Set up message handling
                this.node.port.onmessage = (e) => this.handleWorkerMessage(e);

                // Connect audio graph
                source.connect(this.node);
                this.node.connect(this.context.destination);
            } catch (error) {
                console.error('Failed to initialize AudioWorklet:', error);
                this.errorCallback('initialization_error');
            }
        }

        start(data) {
            this.consumers.forEach(consumer => {
                consumer.postMessage({ command: 'start', data: data });
            });
            
            this.node.port.postMessage({ command: 'start' });
            this.recording = true;
            
            return this.consumers.length > 0;
        }

        stop() {
            if (this.recording) {
                this.consumers.forEach(consumer => {
                    consumer.postMessage({ command: 'stop' });
                });
                
                this.node.port.postMessage({ command: 'stop' });
                this.recording = false;
            }
        }

        cancel() {
            this.stop();
        }

        handleWorkerMessage(e) {
            if (e.data.error && e.data.error === "silent") {
                this.errorCallback("silent");
            }
            
            if (e.data.command === 'newBuffer' && this.recording) {
                this.consumers.forEach(consumer => {
                    consumer.postMessage({ 
                        command: 'process', 
                        data: e.data.data 
                    });
                });
            }
        }
    }

    window.AudioRecorder = AudioRecorder;
})(window);









/*(function(window) {
    var AUDIO_RECORDER_WORKER = 'js/audioRecorderWorker.js';
    var AudioRecorder = function(source, cfg) {
	this.consumers = [];
	var config = cfg || {};
	var errorCallback = config.errorCallback || function() {};
	var inputBufferLength = config.inputBufferLength || 4096;
	var outputBufferLength = config.outputBufferLength || 4000;
	this.context = source.context;
	this.node = this.context.createScriptProcessor(inputBufferLength);
	var worker = new Worker(config.worker || AUDIO_RECORDER_WORKER);
	worker.postMessage({
	    command: 'init',
	    config: {
		sampleRate: this.context.sampleRate,
		outputBufferLength: outputBufferLength,
		outputSampleRate: (config.outputSampleRate || 16000)
	    }
	});
	var recording = false;
	this.node.onaudioprocess = function(e) {
	    if (!recording) return;
	    worker.postMessage({
		command: 'record',
		buffer: [
		    e.inputBuffer.getChannelData(0),
		    e.inputBuffer.getChannelData(1)
		]
	    });
	};
	this.start = function(data) {
	    this.consumers.forEach(function(consumer, y, z) {
                consumer.postMessage({ command: 'start', data: data });
		recording = true;
		return true;
	    });
	    recording = true;
	    return (this.consumers.length > 0);
	};
	this.stop = function() {
	    if (recording) {
		this.consumers.forEach(function(consumer, y, z) {
                    consumer.postMessage({ command: 'stop' });
		});
		recording = false;
	    }
	    worker.postMessage({ command: 'clear' });
	};
	this.cancel = function() {
	    this.stop();
	};
	myClosure = this;
	worker.onmessage = function(e) {
	    if (e.data.error && (e.data.error == "silent")) errorCallback("silent");
	    if ((e.data.command == 'newBuffer') && recording) {
		myClosure.consumers.forEach(function(consumer, y, z) {
                    consumer.postMessage({ command: 'process', data: e.data.data });
		});
	    }
	};
	source.connect(this.node);
	this.node.connect(this.context.destination);
    };
    window.AudioRecorder = AudioRecorder;
})(window);
*/
