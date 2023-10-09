
function sleep(ms) {
  return new Promise(
    resolve => setTimeout(resolve, ms)
  );
}

const recognition = new webkitSpeechRecognition();
recognition.continuous = true;
recognition.interimResults = true;
recognition.lang = 'en-US';

let finalTranscript = '';
let interimTranscript = '';
var last = "";


recognition.onresult = function (event) {
  for (let i = event.resultIndex; i < event.results.length; ++i) {
    if (event.results[i].isFinal) {
      finalTranscript += event.results[i][0].transcript + '. ';
    } else {
      interimTranscript += event.results[i][0].transcript;
    }


    if (finalTranscript !== last) {
      document.getElementById("text").textContent = 'Voice command recognized!';
      last = finalTranscript;
    };

    recognition.onspeechend = async function () {


    };
    var wakefails = 0;

    if (finalTranscript.includes('akari')) {
      textOnly = 'voice';
      bubble_incoming(finalTranscript);
      respond(finalTranscript);
      finalTranscript = '';
    } else {
      wakefails = wakefails + 1;
    };
    if (finalTranscript.includes('enter command')) {
      textOnly = 'voice';
      bubble_incoming(finalTranscript);
      respond(finalTranscript);
      finalTranscript = '';
    } else {
      wakefails = wakefails + 1;
    };

    finalTranscript = ' ';
    if (wakefails == 2) {
      document.getElementById("text").textContent = 'Voice control listening...';
      wakefails = 0;
    };

  }


};

recognition.start();


recognition.onend = function () {
  recognition.start();
};
