(() => {
  // Detect logged-in username automatically
  const userLink = document.querySelector("a.user-link[href^='/@/']");
  if (!userLink) return;
  const myUsername = userLink.textContent.trim();

  // Prepare sound
  const sound = new Audio("https://actions.google.com/sounds/v1/cartoon/clang_and_wobble.ogg");

  // Check if message mentions the user
  function checkMessage(msgElement) {
    const textEl = msgElement.querySelector("t");
    if (!textEl) return;
    const text = textEl.innerText || textEl.textContent;
    if (text.includes("@" + myUsername)) {
      sound.play().catch(() => {}); // swallow autoplay errors
    }
  }

  // Initial scan
  document.querySelectorAll("li.message").forEach(checkMessage);

  // Observe for new messages
  const observer = new MutationObserver(mutations => {
    mutations.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.nodeType === 1) {
          if (node.classList.contains("message")) {
            checkMessage(node);
          } else {
            node.querySelectorAll?.("li.message").forEach(checkMessage);
          }
        }
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
