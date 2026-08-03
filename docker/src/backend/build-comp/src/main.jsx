// This bootstrap only exists so Vite has a build input.
// The real product of this project is the federation remote entry and its chunks.
const rootEl = document.getElementById('root')
if (rootEl) {
  rootEl.textContent = 'component build project'
}
