console.log('Preparing to load Akari Vision...')
fetch('https://76836.github.io/Akari/characters/akari/vision')
  .then(response => response.text())
  .then(htmlContent => {
    const targetDiv = document.getElementById('avatar');
    targetDiv.innerHTML = htmlContent;
  })
  .catch(error => {
    console.error('Error loading Akari Vision:', error);
  });
