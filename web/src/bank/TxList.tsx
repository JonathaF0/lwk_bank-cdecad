import type { ReactNode } from 'react';
import type { Transaction, TxType } from '../nui';
import { isIncoming, useBank } from '../store';
import { Icon, type IconName } from '../fx';

const ICON: Record<TxType, IconName> = {
  deposit: 'cash',
  withdraw: 'cash',
  transfer_in: 'in',
  transfer_out: 'out',
  paycheck: 'pay',
  bill: 'bill',
  interest: 'spark',
  loan: 'bank',
  fee: 'bill',
};

const time = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
const startOfDay = (t: number) => new Date(t).setHours(0, 0, 0, 0);

export function dayLabel(t: number) {
  const diff = Math.round((startOfDay(Date.now()) - startOfDay(t)) / 86_400_000);
  return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : day.format(t);
}

export function TxRow({ tx, showDay, action }: { tx: Transaction; showDay?: boolean; action?: ReactNode }) {
  const { money } = useBank();
  const inc = isIncoming(tx.type);
  return (
    <li className={action ? 'tx tx-x' : 'tx'} data-reveal>
      <span className={`tx-icon ${inc ? 'is-in' : 'is-out'}`}>
        <Icon name={ICON[tx.type]} />
      </span>
      <span className="tx-main">
        <span className="tx-label">{tx.label}</span>
        <span className="tx-sub">
          {tx.pot === 'savings' && <>Savings · </>}
          {tx.counterparty && <>{tx.counterparty} · </>}
          {showDay ? `${dayLabel(tx.date)} · ` : ''}
          {time.format(tx.date)}
        </span>
      </span>
      <span className={`tx-amount num ${inc ? 'is-in' : ''}`}>{money(inc ? tx.amount : -tx.amount, { sign: true })}</span>
      {action}
    </li>
  );
}
