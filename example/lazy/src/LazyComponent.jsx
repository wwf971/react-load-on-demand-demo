import { useState } from 'react'
import './LazyComponent.css'

function LazyComponent() {
  const [count, setCount] = useState(0)

  return (
    <div className="lazy-component">
      <h2>🎉 Lazy Component Loaded!</h2>
      <p>This component was loaded dynamically from a remote bundle.</p>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          Count is {count}
        </button>
      </div>
      <p className="info">
        This demonstrates Module Federation-style dynamic loading
      </p>
    </div>
  )
}

export default LazyComponent
