(function () {
  function akariRoot() {
    try {
      var scripts = document.getElementsByTagName('script');
      for (var i = scripts.length - 1; i >= 0; i--) {
        var src = scripts[i].src || '';
        if (/\/characters\/hiyori\/avatar\.js/i.test(src)) {
          return src.replace(/characters\/hiyori\/avatar\.js.*$/i, '');
        }
      }
    } catch (e) {}
    return './';
  }
  var root = akariRoot();
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
<iframe src="${root}characters/hiyori/avatar/" class="avatariframe"></iframe>
`;
  if (document.getElementById('avatar')) document.getElementById('avatar').innerHTML = thehtml;
})();
