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

function showSettings(button) {
    const main = document.getElementById('settings-main');
    const settings = document.getElementById('settings' + button.id.slice(3));
    main.style.display = 'none';
    settings.style.display = 'flex';
}

function setVolume(volume) {
    localStorage.setItem('volume', volume);
}

function setSoundTheme(soundTheme) {
    localStorage.setItem('soundTheme', soundTheme);
}

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

document.querySelector('.navbar-toggle')
  .addEventListener('click', () => document.querySelectorAll('.topnav a').forEach(nav => nav.classList.toggle('navbar-show')));

const currentVolume = localStorage.getItem('volume');
const volumeSlider = document.getElementById("sound-volume");
if (currentVolume !== undefined) {
    setVolume(currentVolume);
    volumeSlider.value = currentVolume;
}
else {
    setVolume(1);
    volumeSlider.value = 1;
}

const currentSoundTheme = localStorage.getItem('soundTheme');
if (currentSoundTheme !== undefined)
    setSoundTheme(currentSoundTheme);
else
    setSoundTheme('standard');

const currentTheme = localStorage.getItem('theme');
if (currentTheme !== undefined)
    setTheme(currentTheme);
else
    setTheme('light');
