import type { ReactNode } from 'react';

interface PlaceholderPanelProps {
  title: string;
  children?: ReactNode;
  collapsed?: boolean;
}

export function PlaceholderPanel({ title, children, collapsed = false }: PlaceholderPanelProps) {
  return (
    <section className={`panel ${collapsed ? 'panel-collapsed' : ''}`}>
      <div className="panel-header">
        <h3>{title}</h3>
        {collapsed ? <span className="pill">Collapsed</span> : null}
      </div>
      {!collapsed ? <div className="panel-body">{children ?? <p className="muted">Placeholder content</p>}</div> : null}
    </section>
  );
}
