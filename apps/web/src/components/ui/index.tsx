import {
  forwardRef,
  useEffect,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { assetUrl } from '../../lib/api';
import type { UserCard } from '../../types';

// ── Button ──────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'glass' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-violet-500 via-indigo-500 to-fuchsia-500 text-white shadow-[0_12px_32px_-12px_rgba(139,92,246,.75)] hover:brightness-110 active:brightness-95',
  secondary: 'bg-white/[0.07] text-primary border border-line hover:bg-white/[0.11]',
  ghost: 'text-muted hover:text-primary hover:bg-white/[0.06]',
  glass: 'bg-white/[0.06] text-primary border border-white/10 backdrop-blur-xl hover:bg-white/[0.1]',
  danger: 'bg-rose-500/15 text-rose-300 border border-rose-500/25 hover:bg-rose-500/25',
  success: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 hover:bg-emerald-500/25',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-xs rounded-xl gap-1.5',
  md: 'h-11 px-5 text-sm rounded-2xl gap-2',
  lg: 'h-[52px] px-6 text-[15px] rounded-2xl gap-2.5',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, icon, children, fullWidth, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'relative inline-flex select-none items-center justify-center font-semibold transition-all duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
        buttonVariants[variant],
        buttonSizes[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
      {children}
    </button>
  );
});

// ── Card ────────────────────────────────────────────────────

export function Card({
  children,
  className,
  onClick,
  glow,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  glow?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-3xl border border-line bg-surface/70 shadow-card backdrop-blur-2xl',
        glow && 'shadow-glow',
        onClick && 'cursor-pointer transition hover:border-white/20',
        className,
      )}
    >
      {children}
    </div>
  );
}

// ── Avatar ──────────────────────────────────────────────────

export function Avatar({
  user,
  size = 44,
  ring,
  online,
  className,
}: {
  user?: Partial<UserCard> | null;
  size?: number;
  ring?: boolean;
  online?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = assetUrl(user?.avatarUrl);
  const isEmoji = Boolean(src && !src.startsWith('/') && !src.startsWith('http') && !src.startsWith('data:'));
  const initials = [user?.firstName, user?.lastName]
    .filter(Boolean)
    .map((part) => part![0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || (user?.username?.[0]?.toUpperCase() ?? 'F');
  const hue1 = user?.profile?.accentColor ?? '#8b5cf6';
  const hue2 = '#ec4899';

  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <div
        className={cn(
          'flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-white/15 font-display font-semibold text-white',
          ring && 'ring-2 ring-violet-400/60 ring-offset-2 ring-offset-app',
        )}
        style={{ background: `linear-gradient(135deg, ${hue1}, ${hue2})`, fontSize: size * 0.34 }}
      >
        {isEmoji ? (
          <span style={{ fontSize: size * 0.5, lineHeight: 1 }}>{src}</span>
        ) : src && !failed ? (
          <img
            src={src}
            alt={user?.firstName ?? 'Аватар'}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setFailed(true)}
          />
        ) : (
          <span>{initials}</span>
        )}
      </div>
      {online && (
        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-app bg-emerald-400" />
      )}
      {user?.level !== undefined && size >= 48 && (
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border border-white/15 bg-app px-1.5 py-[1px] text-[9px] font-bold text-primary">
          {user.level}
        </span>
      )}
    </div>
  );
}

// ── Progress ────────────────────────────────────────────────

export function Progress({
  value,
  max = 100,
  className,
  barClassName,
  height = 6,
}: {
  value: number;
  max?: number;
  className?: string;
  barClassName?: string;
  height?: number;
}) {
  const percent = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div
      className={cn('w-full overflow-hidden rounded-full bg-white/[0.08]', className)}
      style={{ height }}
    >
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${percent}%` }}
        transition={{ type: 'spring', stiffness: 90, damping: 18 }}
        className={cn(
          'h-full rounded-full bg-gradient-to-r from-violet-400 via-indigo-400 to-fuchsia-400',
          barClassName,
        )}
      />
    </div>
  );
}

// ── Skeleton ────────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-shimmer rounded-2xl bg-[linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,255,255,.09),rgba(255,255,255,.04))] bg-[length:200%_100%]',
        className,
      )}
    />
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-4 px-4 pt-3">
      <Skeleton className="h-48 w-full rounded-4xl" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-20" />
      <Skeleton className="h-20" />
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────

export function EmptyState({
  icon = '✨',
  title,
  text,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  text?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      <div className="relative mb-5">
        <div className="absolute inset-0 rounded-full bg-violet-500/25 blur-2xl" />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-[28px] border border-line bg-surface/80 text-4xl shadow-card">
          {icon}
        </div>
      </div>
      <h3 className="font-display text-lg font-semibold text-primary">{title}</h3>
      {text && <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ── Section header ──────────────────────────────────────────

export function SectionHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-3 flex items-end justify-between gap-3', className)}>
      <div>
        <h2 className="font-display text-[17px] font-semibold tracking-tight text-primary">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ── Modal ───────────────────────────────────────────────────

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = original;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[150] flex items-end justify-center sm:items-center sm:p-6">
          <motion.button
            type="button"
            aria-label="Закрыть"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className={cn(
              'relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[28px] border border-line bg-raised/95 shadow-2xl backdrop-blur-2xl sm:rounded-3xl',
              size === 'sm' && 'sm:max-w-sm',
              size === 'md' && 'sm:max-w-md',
              size === 'lg' && 'sm:max-w-2xl',
            )}
          >
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-white/20 sm:hidden" />
            {title && (
              <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
                <h2 id={titleId} className="font-display text-lg font-semibold text-primary">
                  {title}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl p-2 text-muted transition hover:bg-white/10 hover:text-primary"
                  aria-label="Закрыть"
                >
                  <X size={18} />
                </button>
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[calc(20px+var(--safe-bottom,0px))] pt-2">
              {children}
            </div>
            {footer && <div className="border-t border-line px-5 py-3 pb-[calc(12px+var(--safe-bottom,0px))]">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ── Tabs ────────────────────────────────────────────────────

export function Tabs<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; icon?: ReactNode }>;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const id = useId();
  return (
    <div
      className={cn(
        'no-scrollbar flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface/60 p-1',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'relative flex flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 font-semibold transition',
              size === 'sm' ? 'h-8 text-[11px]' : 'h-10 text-xs',
              active ? 'text-white' : 'text-muted hover:text-primary',
            )}
          >
            {active && (
              <motion.span
                layoutId={`tab-${id}`}
                className="absolute inset-0 rounded-xl bg-gradient-to-r from-violet-500/90 to-fuchsia-500/80 shadow-[0_8px_20px_-10px_rgba(139,92,246,.9)]"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              {option.icon}
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Misc ────────────────────────────────────────────────────

export function Badge({
  children,
  tone = 'violet',
  className,
}: {
  children: ReactNode;
  tone?: 'violet' | 'emerald' | 'amber' | 'rose' | 'sky' | 'neutral';
  className?: string;
}) {
  const tones = {
    violet: 'bg-violet-500/15 text-violet-700 dark:text-violet-200 border-violet-500/20',
    emerald: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-200 border-emerald-500/20',
    amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-200 border-amber-500/20',
    rose: 'bg-rose-500/15 text-rose-700 dark:text-rose-200 border-rose-500/20',
    sky: 'bg-sky-500/15 text-sky-700 dark:text-sky-200 border-sky-500/20',
    neutral: 'bg-white/[0.06] text-muted border-line',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ className, size = 20 }: { className?: string; size?: number }) {
  return <Loader2 size={size} className={cn('animate-spin text-muted', className)} />;
}

export function Coin({ amount, className }: { amount: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 font-semibold text-amber-300', className)}>
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-orange-500 text-[9px] font-black text-amber-950">
        F
      </span>
      {new Intl.NumberFormat('ru-RU').format(amount)}
    </span>
  );
}

export function Input({
  label,
  hint,
  error,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string;
}) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-xs font-semibold text-muted">{label}</span>}
      <input
        className={cn(
          'h-11 w-full rounded-2xl border border-line bg-black/20 px-4 text-sm text-primary outline-none transition placeholder:text-muted/60 focus:border-violet-400/60 focus:ring-4 focus:ring-violet-500/10',
          error && 'border-rose-500/50',
          className,
        )}
        {...props}
      />
      {hint && !error && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-[11px] text-rose-400">{error}</span>}
    </label>
  );
}

export function Textarea({
  label,
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-xs font-semibold text-muted">{label}</span>}
      <textarea
        className={cn(
          'w-full resize-none rounded-2xl border border-line bg-black/20 px-4 py-3 text-sm text-primary outline-none transition placeholder:text-muted/60 focus:border-violet-400/60 focus:ring-4 focus:ring-violet-500/10',
          className,
        )}
        {...props}
      />
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-semibold text-primary">{label}</p>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full border transition',
          checked ? 'border-violet-400/40 bg-violet-500' : 'border-line bg-white/10',
        )}
      >
        <motion.span
          animate={{ x: checked ? 20 : 2 }}
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
          className="absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow"
        />
      </button>
    </div>
  );
}
