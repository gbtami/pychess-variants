var silence = false;
function toggleAudio() {
    silence = !silence;
    var snd_btn = document.getElementById("btn-sound");
    var allaudio = document.getElementsByTagName('audio');
    if (silence) snd_btn.innerHTML = '<div class="icon icon-volume-off"></div>';
    else snd_btn.innerHTML = '<div class="icon icon-volume-up"></div>';
    for (var j = 0; j < allaudio.length; j++) allaudio[j].muted = silence;
}

var darkmode = false;
function toggleDarkmode() {
    darkmode = !darkmode;
    var darkmode_btn = document.getElementById("btn-darkmode");
    if (darkmode) {
        darkmode_btn.innerHTML = '<div class="icon icon-dark"></div>';
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark'); 
    } else {
        darkmode_btn.innerHTML = '<div class="icon icon-light"></div>';
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light'); 
    }
}
const currentTheme = localStorage.getItem('theme');
if (currentTheme !== undefined) {
    document.documentElement.setAttribute('data-theme', currentTheme);
    if (currentTheme === 'dark') toggleDarkmode();
}
