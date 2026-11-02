/**
 * ReviewStatusBadge
 * Renders a colored badge for review_status.
 *
 * @param {{ status: string }} props
 */
export default function ReviewStatusBadge({ status }) {
  const dotMap = {
    flagged: 'bg-red-500',
    verified: 'bg-green-500',
    unreviewed: 'bg-gray-400',
  };
  const labelMap = {
    flagged: 'Flagged',
    verified: 'Verified',
    unreviewed: 'Unreviewed',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs whitespace-nowrap ${status === 'flagged' ? 'font-semibold text-red-700' : 'font-medium text-gray-800'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotMap[status] || 'bg-gray-400'}`} aria-hidden="true" />
      {labelMap[status] || status || '—'}
    </span>
  );
}
