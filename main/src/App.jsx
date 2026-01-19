import { useState } from 'react'
import './App.css'
import { loadFederatedComponent } from './compLoader'

function App() {
  const [LazyComp, setLazyComp] = useState(null)
  const [Lazy2Comp, setLazy2Comp] = useState(null)
  const [loading, setLoading] = useState(null) // null, 'lazy', or 'lazy-2'
  const [error, setError] = useState(null)

  const handleLoadComponent = async (componentName, setComponent) => {
    setLoading(componentName)
    setError(null)
    
    try {
      // Fetch metadata from server
      const response = await fetch(`/get-component-metadata/${componentName}`)
      const meta = await response.json()
      
      console.log('Received metadata:', meta)
      
      // Load the federated component
      const Component = await loadFederatedComponent(meta)
      setComponent(() => Component)
    } catch (err) {
      console.error(`Failed to load ${componentName}:`, err)
      setError(err.message)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="app">
      <h1>Dynamic React Component Loading via Module Federation: An Example</h1>
      <p className="description">
        Module Federation-style dynamic component loading with @xxx/xxx naming pattern.
        Click buttons to fetch and render components from remote bundles.
      </p>

      <div className="card">
        {!LazyComp && !Lazy2Comp && !loading && (
          <div className="button-group">
            <button 
              onClick={() => handleLoadComponent('lazy', setLazyComp)} 
              className="load-button"
            >
              Load @lazy/component
            </button>
            <button 
              onClick={() => handleLoadComponent('lazy-2', setLazy2Comp)} 
              className="load-button secondary"
            >
              Load @lazy2/feature
            </button>
          </div>
        )}
        
        {loading && (
          <div className="loading">
            <div className="spinner"></div>
            <p>Loading {loading}...</p>
          </div>
        )}
        
        {error && (
          <div className="error">
            <p>❌ Error: {error}</p>
          </div>
        )}
        
        {LazyComp && (
          <div className="lazy-wrapper">
            <LazyComp />
            <button 
              onClick={() => setLazyComp(null)} 
              className="reset-button"
            >
              Unload Component
            </button>
          </div>
        )}
        
        {Lazy2Comp && (
          <div className="lazy-wrapper">
            <Lazy2Comp />
            <button 
              onClick={() => setLazy2Comp(null)} 
              className="reset-button"
            >
              Unload Component
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
