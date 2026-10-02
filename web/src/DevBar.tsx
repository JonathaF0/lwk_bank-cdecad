import { getMockData, patchMockConfig, simulateIncoming } from './mock';
import type { NuiMessage } from './nui';

/** Browser-only toolbar that fakes Lua messages through the real message path. */
const send = (msg: NuiMessage) => window.postMessage(msg, '*');

const ACCENTS = ['#c8f031', '#3ec7ff', '#ff7a1a', '#ff4f9a', '#1d3fd1'];
const OPTIONAL = ['cards', 'savings', 'loans', 'bills', 'accounts'] as const;

export function DevBar() {
  return (
    <div className="devbar mono">
      <span>Dev</span>
      <button onClick={() => send({ action: 'open', data: getMockData() })}>Bank</button>
      <button onClick={() => send({ action: 'openAtm', data: getMockData() })}>ATM</button>
      <button
        onClick={() => {
          send({ action: 'update', data: simulateIncoming() });
          send({ action: 'incoming', amount: 750, from: 'Yusuf Adebayo' });
        }}
      >
        +$750
      </button>
      <button
        onClick={() =>
          send({ action: 'update', data: patchMockConfig((c) => (c.accent = ACCENTS[(ACCENTS.indexOf(c.accent) + 1) % ACCENTS.length])) })
        }
      >
        Accent
      </button>
      <button
        onClick={() =>
          send({
            action: 'update',
            data: patchMockConfig((c) => {
              const on = !c.features.loans;
              OPTIONAL.forEach((k) => (c.features[k] = on));
            }),
          })
        }
      >
        Features
      </button>
      <button onClick={() => send({ action: 'update', data: patchMockConfig((c) => (c.sound.enabled = !c.sound.enabled)) })}>Sound</button>
      <button onClick={() => send({ action: 'close' })}>Close</button>
    </div>
  );
}
