import { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/base.css';
import './styles/fx.css';
import './styles/bank.css';
import './styles/atm.css';
import './styles/features.css';
import './styles/admin.css';
import './styles/receipt.css';
import { App } from './App';
import { fetchNui, isBrowser, setMockHandler } from './nui';
import { preloadSounds } from './sound';
import { cardStage } from './atm/card-stage';

// Decode recordings at startup so even the very first open sound is the real one.
preloadSounds();

// Build the 3D card (three.js, WebGL context, lighting, shaders) while the player is still
// loading into the server, so the first time a card appears there's nothing left to build.
const warmCard = () => cardStage().catch(() => {});
if ('requestIdleCallback' in window) requestIdleCallback(warmCard, { timeout: 5000 });
else setTimeout(warmCard, 1000);

// Browser dev only: fake Lua with mock data. Dropped from the production build.
if (import.meta.env.DEV && isBrowser) {
  import('./mock').then(({ getMockData, mockHandler }) => {
    setMockHandler(mockHandler);
    document.body.classList.add('dev-env');
    setTimeout(() => window.postMessage({ action: 'open', data: getMockData() }, '*'), 300);
  });
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
