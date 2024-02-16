
var thehtml =`
<style>
.avatariframe {
    width:100%;
    height:100%;
    position:fixed;
    left:0;
    top:0;
    z-index:-1;
    border:0;
}
</style>
<iframe src="http://127.0.0.1:8084/characters/hiyori/avatar/index" class="avatariframe"></iframe>

`;
document.getElementById('avatar').innerHTML = thehtml;