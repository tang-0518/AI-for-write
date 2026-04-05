// =============================================================
// components/ErrorBoundary.tsx — 全局错误边界
// =============================================================

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error);
    return { hasError: true, message };
  }

  handleReload = () => {
    window.location.reload();
  };

  handleDismiss = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-screen">
          <div className="error-boundary-card">
            <div className="error-boundary-icon">⚠️</div>
            <h2 className="error-boundary-title">出现了一个意外错误</h2>
            <p className="error-boundary-msg">{this.state.message || '未知错误'}</p>
            <div className="error-boundary-actions">
              <button className="cmd-btn" onClick={this.handleDismiss}>
                尝试继续
              </button>
              <button className="cmd-btn primary" onClick={this.handleReload}>
                重新加载
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
