    const canvas = document.getElementById('board');
    const ctx = canvas.getContext('2d');
    const messageElement = document.getElementById('message');
    const counterElement = document.getElementById('counter');
    const resetButton = document.getElementById('reset-button');

    const boardSize = 8;
    const cellSize = canvas.width / boardSize;

    const board = Array.from({ length: boardSize }, () => Array(boardSize).fill(0));

    let solutionsFound = 0;
    let uniqueSolutions = new Set();

    const queenImage = new Image();
    queenImage.onload = () => {
      drawBoard(); // Call drawBoard() after the image is loaded
    };
    queenImage.src = '/static/images/pieces/maestro/bQ.svg';

    function isSafe(row, col) {
      for (let i = 0; i < boardSize; i++) {
        if (board[row][i] || board[i][col]) {
          return false;
        }
        if (row + i < boardSize && col + i < boardSize && board[row + i][col + i]) {
          return false;
        }
        if (row - i >= 0 && col + i < boardSize && board[row - i][col + i]) {
          return false;
        }
        if (row + i < boardSize && col - i >= 0 && board[row + i][col - i]) {
          return false;
        }
        if (row - i >= 0 && col - i >= 0 && board[row - i][col - i]) {
          return false;
        }
      }
      return true;
    }

    function getBoardIdentifier() {
      return board.flat().join('');
    }

    function drawBoard() {
      for (let row = 0; row < boardSize; row++) {
        for (let col = 0; col < boardSize; col++) {
          const isLightSquare = (row + col) % 2 === 0;
          ctx.fillStyle = isLightSquare ? '#f0d9b5' : '#b58863';
          ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);

          if (board[row][col]) {
            // Draw the queen image instead of the black dot
            ctx.drawImage(queenImage, col * cellSize, row * cellSize, cellSize, cellSize);
          }
        }
      }
    }

    function showMessage(message, isVisible = true) {
      messageElement.textContent = message;
      messageElement.style.opacity = isVisible ? 1 : 0;
    }

    function isGameOver() {
      return board.flat().filter(val => val === 1).length === boardSize;
    }

    function placeQueen(row, col) {
      board[row][col] = 1;
    }

    function removeQueen(row, col) {
      board[row][col] = 0;
    }

    function resetBoard() {
      board.forEach(row => row.fill(0));
      drawBoard();
      showMessage("A new board has been opened. Good luck finding the solution!"); 
    }

    function placeOrRemoveQueen(event) {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const row = Math.floor(y / cellSize);
      const col = Math.floor(x / cellSize);

      if (board[row][col]) {
        removeQueen(row, col);
      } else {
        if (isSafe(row, col)) {
          placeQueen(row, col);
          showMessage("", false); // Hide the message when a valid move is made
        } else {
          showMessage("Invalid move! Queens cannot attack each other.");
        }
      }

      drawBoard();

      if (isGameOver()) {
        const boardIdentifier = getBoardIdentifier();
        if (!uniqueSolutions.has(boardIdentifier)) {
          uniqueSolutions.add(boardIdentifier);
          solutionsFound++;
          showMessage(`Congratulations! You found one solution. There are ${92 - solutionsFound} left. Click "RESET" to continue solving. Can you find others?`);
          counterElement.textContent = `Solutions found: ${solutionsFound}`;
        }

        if (solutionsFound === 92) {
          showMessage("Congratulations! You are now a grandmaster of 8 Queens!");
        }
      }
    }

    canvas.addEventListener('click', placeOrRemoveQueen);

    // Add event listener for the "Reset" button
    resetButton.addEventListener('click', resetBoard);

    drawBoard();
