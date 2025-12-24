var thehtml =`
<style>
.avatariframe {
    width:100%;
    height:100%;
    position:fixed;
    left:0;
    top:0;
    z-index:1;
    border:0;
}
</style>
<iframe src="./engine/expressive-VRM.html?modelUrl=https://76836.github.io/Akari/characters/akari/VRM/1192842823581716627.vrm&debug=false" class="avatariframe"></iframe>
`;
loadscreen("(3rd revision) Loading Akari's VRM...");
document.getElementById('avatar').innerHTML = thehtml;

const middlemanScript = document.createElement('script');
middlemanScript.type = 'module';
middlemanScript.textContent = `
  import analyzeEmotion from "https://76836.github.io/emotionEngine/engine.js";

  window.addEventListener('storage', (event) => {
    if (event.key === 'emote' && event.newValue) {
      // Analyze the raw text from 'emote'
      const result = analyzeEmotion(event.newValue);
      
      // Set the clean emotion ID to 'v2emote' for the avatar to read
      localStorage.setItem('v2emote', result.dominant);
      console.log("emotionEngine: Processed " + result.dominant + " to v2emote");
    }
  });
`;
document.head.appendChild(middlemanScript);
