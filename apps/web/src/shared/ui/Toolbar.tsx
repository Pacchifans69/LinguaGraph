import type { HTMLAttributes, ReactNode } from 'react';

export interface ToolbarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  label: string;
  children: ReactNode;
  density?: 'compact' | 'regular';
}

/** Reusable semantic action group for current workbench controls. */
export function Toolbar({
  label,
  children,
  className = '',
  density = 'regular',
  ...props
}: ToolbarProps) {
  const classes = ['ui-toolbar', `ui-toolbar--${density}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div {...props} className={classes} role="group" aria-label={label}>
      {children}
    </div>
  );
}
