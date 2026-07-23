
import { CheckCircle2, XCircle, Clock } from 'lucide-react';

interface Props { status: string; small?: boolean }

export default function StatusBadge({ status, small }: Props) {
  const s = status?.toUpperCase();
  const base = `inline-flex items-center gap-1 font-semibold rounded-full border ${small ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'}`;

  if (s === 'COMPLIANT' || s === 'ENROLLED')
    return <span className={`${base} bg-green-500/10 text-green-400 border-green-500/20`}><CheckCircle2 className="w-3 h-3" />{status}</span>;
  if (s === 'NON_COMPLIANT' || s === 'UNENROLLED' || s === 'FAILED')
    return <span className={`${base} bg-red-500/10 text-red-400 border-red-500/20`}><XCircle className="w-3 h-3" />{status}</span>;
  return <span className={`${base} bg-amber-500/10 text-amber-400 border-amber-500/20`}><Clock className="w-3 h-3" />{status}</span>;
}
