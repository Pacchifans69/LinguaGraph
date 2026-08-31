import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  isPending?: boolean;
}

/**
 * Product-shaped button primitive for repeated LinguaGraph actions.
 *
 * Deliberately small: semantic <button>, four current visual roles, two sizes,
 * and an optional pending lock. It is not a polymorphic component framework.
 */
export function Button({
  children,
  className = '',
  variant = 'secondary',
  size = 'md',
  isPending = false,
  disabled,
  ...props
}: ButtonProps) {
  const classes = [
    'ui-button',
    `ui-button--${variant}`,
    `ui-button--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      {...props}
      className={classes}
      disabled={disabled || isPending}
      aria-busy={isPending || undefined}
    >
      {children}
    </button>
  );
}
