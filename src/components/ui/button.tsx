import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/utils';

type ButtonProps = ComponentPropsWithoutRef<'a'> & {
  variant?: 'primary' | 'secondary' | 'ghost';
};

export function Button({ className, variant = 'primary', ...props }: ButtonProps) {
  return (
    <a
      className={cn(
        'button',
        variant === 'primary' && 'button-primary',
        variant === 'secondary' && 'button-secondary',
        variant === 'ghost' && 'button-ghost',
        className,
      )}
      {...props}
    />
  );
}
