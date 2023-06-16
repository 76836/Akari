const synth = window.speechSynthesis;

const inputForm = document.querySelector("form");
const inputTxt = document.querySelector(".txt");
const voiceSelect = document.querySelector("select");

const pitch = document.querySelector("#pitch");
const pitchValue = document.querySelector(".pitch-value");
const rate = document.querySelector("#rate");
const rateValue = document.querySelector(".rate-value");

var responsetxt = document.querySelector('.responsetxt');

let voices = [];

   function speak(WORDS) {
     if (synth.speaking) {
       console.error("speechSynthesis.speaking");
       return;
     }
   
     if (WORDS !== "") {
       const utterThis = new SpeechSynthesisUtterance(WORDS);
   
       utterThis.onend = function (event) {
         console.log("SpeechSynthesisUtterance.onend");
       };
   
       utterThis.onerror = function (event) {
         console.error("SpeechSynthesisUtterance.onerror");
       };
   
       const selectedOption = "Google US English (en-US)"
   
       for (let i = 0; i < voices.length; i++) {
         if (voices[i].name === selectedOption) {
           utterThis.voice = voices[i];
           break;
         }
       }
       utterThis.pitch = 1;
       utterThis.rate = 1;
       responsetxt.textContent = WORDS;
       synth.speak(utterThis);
       
     }
   }

