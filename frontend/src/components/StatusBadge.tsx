interface Props { status: string; small?: boolean }

export default function StatusBadge({ status, small }: Props) {
  const s = status?.toUpperCase();
  const base = `inline-flex items-center gap-1.5 font-semibold rounded-full border ${
    small ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'
  }`;

  // Dot sizes
  const dot = small ? 'w-1.5 h-1.5' : 'w-2 h-2';

  if (s === 'COMPLIANT' || s === 'ENROLLED') {
    return (
      <span className={`${base} bg-green-500/10 text-green-400 border-green-500/20`}>
        <span className="relative flex-shrink-0">
          <span className={`absolute inset-0 rounded-full bg-green-400 animate-ping opacity-60`} style={{ animationDuration: '2s' }} />
          <span className={`relative block rounded-full bg-green-400 ${dot}`} />
        </span>
        {status}
      </span>
    );
  }

  if (s === 'NON_COMPLIANT' || s === 'UNENROLLED' || s === 'FAILED') {
    return (
      <span className={`${base} bg-red-500/10 text-red-400 border-red-500/20`}>
        <span className={`block rounded-full bg-red-400 flex-shrink-0 ${dot}`} />
        {status}
      </span>
    );
  }

  // Amber / pending / unknown
  return (
    <span className={`${base} bg-amber-500/10 text-amber-400 border-amber-500/20`}>
      <span className="relative flex-shrink-0">
        <span className={`absolute inset-0 rounded-full bg-amber-400 animate-pulse2 opacity-70`} />
        <span className={`relative block rounded-full bg-amber-400 ${dot}`} />
      </span>
      {status}
    </span>
  );
}
