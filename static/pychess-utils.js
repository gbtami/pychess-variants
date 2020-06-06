function classToggle() {
  const navs = document.querySelectorAll('.topnav a')
  navs.forEach(nav => nav.classList.toggle('navbar-show'));
}

document.querySelector('.navbar-toggle')
  .addEventListener('click', classToggle);

function settingsToggle() {
  const settings = document.querySelectorAll('.topnav.settings a');
  settings.forEach(setting => setting.classList.toggle('settings-show'));
}

var audio = 'true';
function toggleAudio() {
    audio = (audio === 'false') ? 'true': 'false' ;
    var snd_btn = document.getElementById("btn-sound");
    var allaudio = document.getElementsByTagName('audio');
    if (audio === 'false') snd_btn.innerHTML = '<div class="icon icon-volume-off"></div>';
    else snd_btn.innerHTML = '<div class="icon icon-volume-up"></div>';
    localStorage.setItem('audio', audio);
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
    var alliside = document.getElementsByTagName('i-side');
    for (var j = 0; j < alliside.length; j++) {
        // take care of random color seek icons
        if (!alliside[j].classList.contains('icon-adjust')) {
            alliside[j].classList.toggle("icon-white");
            alliside[j].classList.toggle("icon-black");
        }
    }
}
const currentTheme = localStorage.getItem('theme');
if (currentTheme !== undefined) {
    document.documentElement.setAttribute('data-theme', currentTheme);
    if (currentTheme === 'dark') toggleDarkmode();
}

const currentAudio = localStorage.getItem('audio');
if (currentAudio !== undefined) {
    if (currentAudio === 'false') toggleAudio();
}
