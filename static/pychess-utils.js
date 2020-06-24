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
        for (const e of settings.children)
            e.style.display = (e.id === 'settings-main' ? 'flex' : 'none');
    }
    else
        settings.style.display = 'none';
}

function showSettings(e) {
    const main = document.getElementById('settings-main');
    const settings = document.getElementById('settings' + e.id.slice(3));
    hideElement(main);
    settings.style.display = 'flex';
}

function setVolume(volume) {
    localStorage.setItem('volume', volume);
}

const currentVolume = localStorage.getItem('volume');
const volumeSlider = document.getElementById("sound-volume");
if (currentVolume !== undefined) {
    setVolume(currentVolume);
    volumeSlider.value = currentVolume;
}
else {
    setVolume(100);
    volumeSlider.value = 100;
}

function setSoundTheme(soundTheme) {
    localStorage.setItem('soundTheme', soundTheme);
}

const currentSoundTheme = localStorage.getItem('soundTheme');
if (currentSoundTheme !== undefined)
    setSoundTheme(currentSoundTheme);
else
    setSoundTheme('standard');

function setTheme(theme) {
    const oldTheme = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    if (oldTheme != theme) {
        var alliside = document.getElementsByTagName('i-side');
        for (var j = 0; j < alliside.length; j++) {
            // take care of random color seek icons
            if (!alliside[j].classList.contains('icon-adjust')) {
                alliside[j].classList.toggle("icon-white");
                alliside[j].classList.toggle("icon-black");
            }
        }
    }
}

const currentTheme = localStorage.getItem('theme');
if (currentTheme !== undefined)
    setTheme(currentTheme);
else
    setTheme('light');
