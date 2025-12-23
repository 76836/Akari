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
<iframe src="./engine/expressive-VRM.html?modelUrl=https://76836.github.io/Akari/characters/akari/VRM/Akarilite.vrm&debug=false" class="avatariframe"></iframe>
`;
loadscreen('Loading AkariNet VRM...');
document.getElementById('avatar').innerHTML = thehtml;
