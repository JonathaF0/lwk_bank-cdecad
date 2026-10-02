import { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/base.css';
import './styles/fx.css';
import './styles/bank.css';
import './styles/atm.css';
import './styles/features.css';
import { App } from './App';
import { fetchNui, isBrowser, setMockHandler } from './nui';
import { getMockData, mockHandler } from './mock';
import { preloadSounds } from './sound';

// Decode recordings at startup so even the very first open sound is the real one.
preloadSounds();

if (isBrowser) {
  setMockHandler(mockHandler);
  document.body.classList.add('dev-env');
  setTimeout(() => window.postMessage({ action: 'open', data: getMockData() }, '*'), 300);
}

/** A render crash must never leave the player stuck with NUI focus and a cursor. */
class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.error('[bank-ui]', err);
    fetchNui('close').catch(() => {});
    // Remount on the next message and replay it, so reopening works without restarting the resource.
    window.addEventListener(
      'message',
      (e) => this.setState({ failed: false }, () => setTimeout(() => window.postMessage(e.data, '*'))),
      { once: true },
    );
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <Guard>
    <App />
  </Guard>,
);
