import './entry.css'

function HelloCard({ data }) {
  return (
    <div className="hello-card">
      <div className="hello-card-title">{data?.title || 'hello'}</div>
      <div className="hello-card-body">{data?.text || 'remote component'}</div>
    </div>
  )
}

export default HelloCard
