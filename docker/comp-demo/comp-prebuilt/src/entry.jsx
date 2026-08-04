import './entry.css'

function HelloCard({ data }) {
  return (
    <div className="hello-card">
      <div className="hello-card-title">{data?.title || 'hello'}</div>
      <div className="hello-card-body">{data?.text || 'remote component'}</div>
    </div>
  )
}

function HelloBadge({ text, tone = 'info' }) {
  return <span className={`hello-badge hello-badge-${tone}`}>{text || 'badge'}</span>
}

export default HelloCard
export { HelloBadge }
