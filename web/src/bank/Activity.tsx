import { useMemo, useState } from 'react';
import { isIncoming, useBank } from '../store';
import { Icon } from '../fx';
import { useAction } from '../ui';
import { AccountPills } from './Overview';
import { TxRow, useDates } from './TxList';
import type { SectionProps } from './Bank';
import type { Transaction } from '../nui';

type Filter = 'all' | 'in' | 'out';
const FILTERS: [Filter, string][] = [
  ['all', 'all'],
  ['in', 'money_in'],
  ['out', 'money_out'],
];
type Pot = 'all' | 'checking' | 'savings';
const POTS: [Pot, string][] = [
  ['all', 'all'],
  ['checking', 'checking'],
  ['savings', 'section_savings'],
];

export function Activity({ accountId, setAccountId }: SectionProps) {
  const { data, cfg, money, t } = useBank();
  const { dayLabel } = useDates();
  const { run } = useAction();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [pot, setPot] = useState<Pot>('all');

  const mine = useMemo(() => data.transactions.filter((t) => t.accountId === accountId), [data.transactions, accountId]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mine.filter(
      (t) =>
        (filter === 'all' || (filter === 'in') === isIncoming(t.type)) &&
        (pot === 'all' || (t.pot ?? 'checking') === pot) &&
        (!q || t.label.toLowerCase().includes(q) || t.counterparty?.toLowerCase().includes(q) || String(t.amount).includes(q)),
    );
  }, [mine, query, filter, pot]);

  const received = mine.filter((t) => isIncoming(t.type)).reduce((s, t) => s + t.amount, 0);
  const spent = mine.filter((t) => !isIncoming(t.type)).reduce((s, t) => s + t.amount, 0);

  const groups = useMemo(() => {
    const m = new Map<string, Transaction[]>();
    for (const t of shown) {
      const k = dayLabel(t.date);
      m.set(k, [...(m.get(k) ?? []), t]);
    }
    return [...m];
  }, [shown, dayLabel]);

  return (
    <div className="panel activity">
      <div className="act-head">
        <AccountPills accountId={accountId} setAccountId={setAccountId} />
        <dl className="act-stats" data-reveal>
          <div>
            <dt className="mono muted">{t('transactions')}</dt>
            <dd className="num">{mine.length}</dd>
          </div>
          <div>
            <dt className="mono muted">{t('received')}</dt>
            <dd className="num">{money(received, { sign: true })}</dd>
          </div>
          <div>
            <dt className="mono muted">{t('sent')}</dt>
            <dd className="num">{money(-spent)}</dd>
          </div>
          <div>
            <dt className="mono muted">{t('net')}</dt>
            <dd className="num">{money(received - spent, { sign: true })}</dd>
          </div>
        </dl>
      </div>

      <div className="act-tools" data-reveal>
        <label className="search">
          <Icon name="search" />
          <span className="sr-only">{t('search_transactions')}</span>
          <input className="input" placeholder={t('search_placeholder')} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        {cfg.features.savings && (
          <div className="chips" role="group" aria-label={t('account_pot')}>
            {POTS.map(([id, label]) => (
              <button key={id} className="chip" aria-pressed={pot === id} onClick={() => setPot(id)}>
                {t(label)}
              </button>
            ))}
          </div>
        )}
        <div className="chips" role="group" aria-label={t('filter')}>
          {FILTERS.map(([id, label]) => (
            <button key={id} className="chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {t(label)}
            </button>
          ))}
        </div>
      </div>

      <div className="act-list" data-reveal>
        {groups.length ? (
          groups.map(([day, txs]) => (
            <section key={day} className="act-day">
              <h3 className="mono muted">{day}</h3>
              <ul className="tx-list">
                {txs.map((tx) => (
                  <TxRow
                    key={tx.id}
                    tx={tx}
                    action={
                      cfg.features.receipts && (
                        <button className="icon-btn tx-print" aria-label={t('print_receipt_for', { name: tx.label })} data-sound="none" onClick={() => run('receiptPrint', { kind: 'transaction', id: tx.id }, 'printer')}>
                          <Icon name="print" size={1} />
                        </button>
                      )
                    }
                  />
                ))}
              </ul>
            </section>
          ))
        ) : (
          <div className="empty-state" role="status">
            <Icon name="search" size={1.75} />
            <p>{mine.length ? t('nothing_matches', { query: query || t(FILTERS.find((f) => f[0] === filter)![1]) }) : t('no_transactions_account')}</p>
            {mine.length > 0 && (
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                  setPot('all');
                }}
              >
                {t('clear_filters')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
