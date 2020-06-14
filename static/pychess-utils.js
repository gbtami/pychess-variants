function classToggle() {
  const navs = document.querySelectorAll('.topnav a')
  navs.forEach(nav => nav.classList.toggle('navbar-show'));
}

document.querySelector('.navbar-toggle')
  .addEventListener('click', classToggle);

function hideElement(e) {
    e.style.display = 'none';
}

function toggleSettings() {
    const settings = document.getElementById('settings');
    if (settings.style.display === 'none') {
        settings.style.display = 'flex';
        for (const s of settings.children)
            s.style.display = (s.id === 'settings-main' ? 'flex' : 'none');
    }
    else
        settings.style.display = 'none';
}

function showLanguage() {
    const main = document.getElementById('settings-main');
    const language = document.getElementById('settings-lang');
    hideElement(main);
    language.style.display = 'flex';
}

var audio = 'true';
function toggleAudio() {
    audio = (audio === 'false') ? 'true': 'false' ;
    var snd_btn = document.getElementById("btn-sound");
    if (audio === 'false') snd_btn.innerHTML = 'No Sound';
    else snd_btn.innerHTML = 'Sound';
    localStorage.setItem('audio', audio);
}


var darkmode = false;
function toggleDarkmode() {
    darkmode = !darkmode;
    var darkmode_btn = document.getElementById("btn-darkmode");
    if (darkmode) {
        darkmode_btn.innerHTML = 'Dark';
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
    } else {
        darkmode_btn.innerHTML = 'Light';
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
