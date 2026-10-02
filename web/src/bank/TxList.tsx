import { useMemo, type ReactNode } from 'react';
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

const startOfDay = (ts: number) => new Date(ts).setHours(0, 0, 0, 0);

/** Locale-aware "Today" / "Yesterday" / "Mon, 28 Sep" and HH:MM. */
export function useDates() {
  const { t, locale } = useBank();
  return useMemo(() => {
    const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
    const day = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' });
    const dayLabel = (ts: number) => {
      const diff = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / 86_400_000);
      return diff === 0 ? t('today') : diff === 1 ? t('yesterday') : day.format(ts);
    };
    return { dayLabel, time: (ts: number) => time.format(ts) };
  }, [t, locale]);
}

export function TxRow({ tx, showDay, action }: { tx: Transaction; showDay?: boolean; action?: ReactNode }) {
  const { money, t } = useBank();
  const { dayLabel, time } = useDates();
  const inc = isIncoming(tx.type);
  return (
    <li className={action ? 'tx tx-x' : 'tx'} data-reveal>
      <span className={`tx-icon ${inc ? 'is-in' : 'is-out'}`}>
        <Icon name={ICON[tx.type]} />
      </span>
      <span className="tx-main">
        <span className="tx-label">{tx.label}</span>
        <span className="tx-sub">
          {tx.pot === 'savings' && <>{t('section_savings')} · </>}
          {tx.counterparty && <>{tx.counterparty} · </>}
          {showDay ? `${dayLabel(tx.date)} · ` : ''}
          {time(tx.date)}
        </span>
      </span>
      <span className={`tx-amount num ${inc ? 'is-in' : ''}`}>{money(inc ? tx.amount : -tx.amount, { sign: true })}</span>
      {action}
    </li>
  );
}
