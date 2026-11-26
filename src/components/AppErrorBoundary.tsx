import { Component, ReactNode } from 'react';
import { ErrorFallbackPage } from './ErrorFallbackPage';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  handleGoHome = () => {
    window.history.pushState({}, '', '/');
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return <ErrorFallbackPage mode="runtime" onGoHome={this.handleGoHome} />;
    }
    return this.props.children;
  }
}
