import { useEffect, useRef, useState, type ReactNode } from 'react';
import { parseAmount, useBank } from './store';
import { Icon } from './fx';
import type { Result } from './nui';
import type { SoundName } from './sound';

/* Small shared form pieces. Animations live in fx.tsx. */

/** Native modal dialog: focus trap, Escape and top-layer stacking come free. Mounted = open. */
export function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className={`dialog ${wide ? 'dialog-wide' : ''}`} onClose={onClose} aria-label={title}>
      <div className="dialog-head">
        <h2>{title}</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function AmountField({ amount, setAmount, invalid, label = 'Amount', autoFocus = true }: { amount: number; setAmount: (n: number) => void; invalid?: boolean; label?: string; autoFocus?: boolean }) {
  return (
    <label className="amount-field">
      <span className="sr-only">{label}</span>
      <span className="amount-prefix" aria-hidden="true">
        $
      </span>
      <input
        autoFocus={autoFocus}
        className="amount-input num"
        inputMode="numeric"
        placeholder="0"
        value={amount ? amount.toLocaleString('en-US') : ''}
        onChange={(e) => setAmount(parseAmount(e.target.value))}
        aria-invalid={invalid}
      />
    </label>
  );
}

export function QuickAmounts({ values, amount, setAmount, max }: { values: number[]; amount: number; setAmount: (n: number) => void; max?: number }) {
  const { money } = useBank();
  return (
    <div className="chips" role="group" aria-label="Quick amounts">
      {values.map((q) => (
        <button key={q} type="button" className="chip" aria-pressed={amount === q} onClick={() => setAmount(q)}>
          {money(q)}
        </button>
      ))}
      {max !== undefined && (
        <button type="button" className="chip" aria-pressed={amount === max && max > 0} onClick={() => setAmount(max)}>
          All · {money(max)}
        </button>
      )}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="toggle" disabled={disabled} onClick={() => onChange(!checked)} data-sound="toggle">
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
      <span>{label}</span>
    </button>
  );
}

export function Progress({ value, max, label, tone }: { value: number; max: number; label: string; tone?: 'warn' | 'neg' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`progress ${tone ? `is-${tone}` : ''}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <span style={{ transform: `scaleX(${pct / 100})` }} />
    </div>
  );
}

export function ErrorLine({ error }: { error?: string | false | null }) {
  return (
    <p className="error-text" role="alert">
      {error && (
        <>
          <Icon name="alert" size={1} /> {error}
        </>
      )}
    </p>
  );
}

/** Wraps a bank call with busy + error state for a form. */
export function useAction() {
  const { act } = useBank();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (event: string, payload: unknown, sound?: SoundName): Promise<Result> => {
    setBusy(true);
    setError('');
    const r = await act(event, payload, sound);
    setBusy(false);
    if (!r.ok) setError(r.error);
    return r;
  };
  return { busy, error, setError, run };
}

export function SubmitButton({ busy, disabled, children, icon = 'check' }: { busy: boolean; disabled?: boolean; children: ReactNode; icon?: Parameters<typeof Icon>[0]['name'] }) {
  return (
    <button className="btn btn-primary btn-block" disabled={disabled || busy} aria-busy={busy}>
      {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name={icon} />}
      {busy ? 'Processing' : children}
    </button>
  );
}

export { parseAmount };
