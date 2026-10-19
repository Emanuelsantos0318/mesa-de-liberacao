import type { ReleaseStatus } from '../types'
export function StatusBadge({status}:{status:ReleaseStatus}){return <span className={`badge ${status.toLowerCase()}`}>{status}</span>}
