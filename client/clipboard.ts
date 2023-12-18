export function copyTextToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(
      () => { console.log('clipboard.writeText()', text) })
      .catch(
      () => { console.log('clipboard.writeText() failed!', text) }
    );
}