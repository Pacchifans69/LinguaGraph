import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: ReactNode;
  titleId?: string;
  eyebrow?: ReactNode;
  description?: ReactNode;
  breadcrumb?: ReactNode;
  actions?: ReactNode;
}

/** Shared page-level hierarchy for Projects, Documents and Workspace. */
export function PageHeader({
  title,
  titleId,
  eyebrow,
  description,
  breadcrumb,
  actions,
}: PageHeaderProps) {
  return (
    <header className="page-header">
      {breadcrumb ? <div className="page-header-breadcrumb">{breadcrumb}</div> : null}
      <div className="page-header-row">
        <div className="page-header-copy">
          {eyebrow ? <p className="page-eyebrow">{eyebrow}</p> : null}
          <h2 id={titleId}>{title}</h2>
          {description ? <p className="page-description">{description}</p> : null}
        </div>
        {actions ? <div className="page-header-actions">{actions}</div> : null}
      </div>
    </header>
  );
}
