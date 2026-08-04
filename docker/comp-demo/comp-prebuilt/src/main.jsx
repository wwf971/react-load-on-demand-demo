import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import HelloCard, { HelloBadge } from './entry.jsx'
import './main.css'

// Local preview only; the uploaded product is the federation build output.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <div className="preview-components">
      <HelloCard data={{ title: 'preview', text: 'local preview of the card' }} />
      <HelloBadge text="ready" tone="success" />
    </div>
  </StrictMode>,
)
