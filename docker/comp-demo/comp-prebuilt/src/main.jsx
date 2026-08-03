import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import HelloCard from './entry.jsx'

// Local preview only; the uploaded product is the federation build output.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HelloCard data={{ title: 'preview', text: 'local preview of the component' }} />
  </StrictMode>,
)
