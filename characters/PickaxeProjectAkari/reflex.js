function respond() {
  alert('URL scheme not supported on Pickaxe embed mode, please switch to normal Akari to use URL queries or other Akari integrations.');
};
function getGreetingByTime() {
  console.log('hello');
};
loadscreen("[ok] Overriding Akari UI with Pickaxe embed.");
var framespot = document.getElementById('messages');
framespot.innerHTML = `
<iframe id=9101SXNR4I loading="eager" src="https://embed.pickaxeproject.com/axe?id=Akari_AI_YVF62&mode=embed_gold&host=beta&theme=custom&opacity=0&description=hide&font_header=Real+Head+Pro&size_header=30&font_body=Real+Head+Pro&size_body=16&font_labels=Real+Head+Pro&size_labels=14&font_button=Real+Head+Pro&size_button=16&c_fb=08090B&c_ff=08090B&c_fbd=FFFFFF&c_rb=7F7F7F&c_bb=FFFFFF&c_bt=FFFFFF&c_t=FFFFFF&s_ffo=100&s_rbo=100&s_bbo=100&s_f=minimalist&s_b=outline&s_t=2&s_to=1&s_r=2" width="100%" height="100vh" onMouseOver="this.style.boxShadow='0px 6px 20px 0px rgba(0,0,0,0.15)'; this.style.transform = 'translateY(-2px)'; this.style.transition = 'transform 300ms ease'" onMouseOut="this.style.boxShadow='none'; this.style.transform = 'translateY(0px)';" style="z-index: 20; position:fixed; top:0; left:0;border:1px solid rgba(0, 0, 0, 0);transition:.3s;border-radius:4px;" frameBorder="0"></iframe>
`;
if (localStorage.getItem('privacynotice') == true) {
  console.log('Privacy notice hidden!');
}else{
  newwindow('https://76836.github.io/Akari/nonprivate');
};
