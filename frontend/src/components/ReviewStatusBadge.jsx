/**
 * ReviewStatusBadge
 * Renders a colored badge for review_status.
 *
 * @param {{ status: string }} props
 */
export default function ReviewStatusBadge({ status }) {
  const colorMap = {
    flagged: 'bg-red-100 text-red-700',
    verified: 'bg-green-100 text-green-700',
    unreviewed: 'bg-gray-100 text-gray-600',
  };
  const labelMap = {
    flagged: 'Flagged',
    verified: 'Verified',
    unreviewed: 'Unreviewed',
  };
  const cls = colorMap[status] || 'bg-gray-100 text-gray-600';
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}
    >
      {labelMap[status] || status || '—'}
    </span>
  );
}
