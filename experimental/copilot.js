var akariuibox = document.createElement('div');
akariuibox.innerHTML = `
<style>
  #slideout-iframe-container {
    position: fixed;
    top: 0;
    right: -100%; /* Start hidden */
    width: 600px;
    height: 100%;
    transition: right 0.5s;
    z-index: 1000;
  }
  #slideout-iframe {
    width: 100%;
    height: 100%;
    background-color: lightcyan;
  }
  #slideout-toggle {
    position: fixed;
    bottom: 0;
    right: 0;
    background-color: darkcyan;
    color: white;
    border: none;
    cursor: pointer;
    padding: 5px;
    font-size: 18px;
    z-index: 1001;
  }
</style>
<div id="slideout-iframe-container">
  <iframe id="slideout-iframe" src="https://76836.github.io/Akari" frameborder="0"></iframe>
</div>
<button id="slideout-toggle">☰</button>
`;
document.body.appendChild(akariuibox);

var iframeContainer = document.getElementById('slideout-iframe-container');
var toggleButton = document.getElementById('slideout-toggle');

toggleButton.onclick = function () {
  var isOpen = iframeContainer.style.right === '0px';
  iframeContainer.style.right = isOpen ? '-100%' : '0px';
  toggleButton.style.right = isOpen ? '0px' : '600px';
};