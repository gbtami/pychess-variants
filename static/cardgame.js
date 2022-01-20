const cards = document.querySelectorAll('.memory-card')
const replay = document.querySelector('#replay')

// refresh the game 

replay.addEventListener('click', () => location.reload())

// Game Logic

let hasFlippedCard = false; 
let lockBoard = false; 
let firstCard, secondCard; 

function flipCard() {
    if (lockBoard) return;
    if (this === firstCard) return; 
    
    this.classList.add('flip')

    if (!hasFlippedCard) {
        // first click
        hasFlippedCard = true;
        firstCard = this;
        
        return; 
    } 
        // second click 
        secondCard = this;

        CheckForMatch()
}

function CheckForMatch() {
    let isMatch = firstCard.dataset.framework === secondCard.dataset.framework
    isMatch ? disableCards() : unflipCards(); 
}

function disableCards() {
    firstCard.removeEventListener('click', flipCard)
    secondCard.removeEventListener('click', flipCard)

    resetBoard();
}

function unflipCards() {
    lockBoard = true;

    setTimeout( () => {
    firstCard.classList.remove('flip')
    secondCard.classList.remove('flip')

    resetBoard();
    }, 700)
}

function resetBoard() {
    [hasFlippedCard, lockBoard] = [false,false];
    [firstCard, secondCard] = [null, null]
}

(function shuffle() {
    cards.forEach(card => {
        let randomPos = Math.floor(Math.random() * 12); 
        card.style.order = randomPos;
    })
})()

cards.forEach(card => card.addEventListener('click', flipCard))


// Game-Background

const gameBoardBackground = document.querySelectorAll('input')
const boardBg = document.querySelector('.memory-game')

gameBoardBackground.forEach( input => {
    input.addEventListener('click', function() {
    const backgroundImg = this.getAttribute('label');
    console.log(backgroundImg);
    boardBg.style= `background: url(images/${backgroundImg}.png);background-size: cover;order: 1000;`
    console.log(boardBg.style);
    })
})
