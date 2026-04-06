/* Class-based error boundary that catches render errors in the video player and shows a fallback message. */
'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class PlayerErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-2xl p-8 bg-white/5 border border-white/8 flex items-center justify-center min-h-[200px]">
          <p className="text-slate-400 text-sm text-center">
            Video player encountered an error.<br />Please refresh the page.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
