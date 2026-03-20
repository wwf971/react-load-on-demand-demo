import { useState } from 'react'
import './SpecialFeature.css'

function SpecialFeature() {
  const [clicks, setClicks] = useState(0)

  return (
    <div className="special-feature">
      <h2>⚡ Special Feature Loaded!</h2>
      <p>This is a second lazy-loaded component with different styling.</p>
      <div className="card">
        <button onClick={() => setClicks((clicks) => clicks + 1)}>
          Clicked {clicks} times
        </button>
      </div>
      <p className="info">
        Lazy-2 component using @lazy2/feature naming pattern
      </p>
    </div>
  )
}

export default SpecialFeature
