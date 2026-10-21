// Loading, empty and error states: each explains what happened and what to do next.
import React from 'react';
import { Inbox, AlertTriangle } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="center-pad">
          <ErrorState
            message={this.state.error?.message || 'An unexpected rendering error occurred.'}
            onRetry={() => {
              this.setState({ hasError: false, error: null });
              this.props.onReset?.();
            }}
          />
        </div>
      );
    }
    return this.props.children;
  }
}

export function PostSkeleton() {
  return (
    <div className="card post skeleton-card" aria-hidden="true">
      <div className="post__head">
        <span className="skeleton skeleton--avatar" />
        <span className="skeleton skeleton--line" style={{ width: 120 }} />
      </div>
      <div className="skeleton skeleton--media" />
      <div className="post__body">
        <span className="skeleton skeleton--line" style={{ width: '70%' }} />
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, children, action }) {
  return (
    <div className="empty fade-up">
      <div className="empty__icon"><Icon size={28} /></div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <EmptyState icon={AlertTriangle} title="Something went wrong" action={onRetry && <button className="btn" onClick={onRetry}>Try again</button>}>
      {message}
    </EmptyState>
  );
}

export function Spinner({ label = 'Loading' }) {
  return <span className="spinner" role="status" aria-label={label} />;
}
