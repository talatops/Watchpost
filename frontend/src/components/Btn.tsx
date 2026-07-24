import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size    = 'sm' | 'md' | 'lg';

interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

const VARIANT: Record<Variant, string> = {
  primary:
    'bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold ' +
    'shadow-lg shadow-accentBlue/20 ' +
    'hover:opacity-90 hover:scale-[1.02] hover:shadow-accentCyan/30 ' +
    'active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100',
  secondary:
    'border border-darkBorder text-gray-300 font-medium ' +
    'hover:bg-darkBg hover:border-gray-500 hover:text-white hover:scale-[1.02] ' +
    'active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100',
  danger:
    'border border-red-500/30 text-red-400 font-medium ' +
    'hover:bg-red-500/10 hover:border-red-500/60 hover:text-red-300 hover:scale-[1.02] ' +
    'active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100',
  ghost:
    'text-gray-400 font-medium ' +
    'hover:text-white hover:bg-darkBg hover:scale-[1.02] ' +
    'active:scale-[0.98] disabled:opacity-50',
};

const SIZE: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-xl gap-1.5',
  md: 'px-5 py-2.5 text-sm rounded-xl gap-2',
  lg: 'px-6 py-3 text-sm rounded-xl gap-2',
};

export default function Btn({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  className = '',
  disabled,
  ...rest
}: BtnProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={[
        'inline-flex items-center justify-center transition-all duration-200',
        'disabled:cursor-not-allowed',
        VARIANT[variant],
        SIZE[size],
        className,
      ].join(' ')}
    >
      {loading
        ? <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
        : icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </button>
  );
}
