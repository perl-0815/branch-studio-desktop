'use client';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useI18n } from '@/lib/i18n';
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function Button({
  className,
  variant = 'ghost',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'ghost' | 'primary' | 'outline' }) {
  return <button className={cn('button', `button-${variant}`, className)} {...props} />;
}
export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <TooltipPrimitive.Provider delayDuration={450}>{children}</TooltipPrimitive.Provider>;
}
export function IconButton({
  label,
  shortcut,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; shortcut?: string }) {
  const { t } = useI18n();
  const translatedLabel = t(label);
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        <button aria-label={translatedLabel} className={cn('icon-button', className)} {...props}>
          {children}
        </button>
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content className="tooltip" sideOffset={7}>
          {translatedLabel}
          {shortcut && <kbd>{shortcut}</kbd>}
          <TooltipPrimitive.Arrow className="tooltip-arrow" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
