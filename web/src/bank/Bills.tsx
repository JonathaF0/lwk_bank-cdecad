import { useBank } from '../store';
import { CountUp, HoldButton, Icon } from '../fx';
import { ErrorLine, useAction } from '../ui';
import { AccountPills } from './Overview';
import { useDates } from './TxList';
import type { SectionProps } from './Bank';

export function Bills({ accountId, setAccountId }: SectionProps) {
  const { data, cfg, money, t } = useBank();
  const { dayLabel } = useDates();
  const { busy, error, run } = useAction();
  const acc = data.accounts.find((a) => a.id === accountId) ?? data.accounts[0];
  const unpaid = data.bills.filter((b) => b.status === 'unpaid');
  const paid = data.bills.filter((b) => b.status === 'paid').sort((a, b) => (b.paidAt ?? 0) - (a.paidAt ?? 0));
  const due = unpaid.reduce((s, b) => s + b.amount, 0);
  const short = !!acc && due > acc.balance;

  return (
    <div className="panel bills">
      <div className="bl-due">
        <span className="mono muted" data-reveal>
          {t('outstanding')}
        </span>
        <CountUp value={due} format={money} className="balance-xl" />
        <span className="muted" data-reveal>
          {unpaid.length ? t(unpaid.length === 1 ? 'unpaid_bill' : 'unpaid_bills', { count: unpaid.length }) : t('all_paid_up')}
        </span>

        <ul className="bill-list">
          {unpaid.map((b) => (
            <li key={b.id} className="bill-row" data-reveal>
              <span className="tx-icon is-out">
                <Icon name="bill" />
              </span>
              <span className="tx-main">
                <span className="tx-label">{b.issuer}</span>
                <span className="tx-sub">
                  {b.label} · {dayLabel(b.issuedAt)}
                </span>
              </span>
              <span className="num bill-amt">{money(b.amount)}</span>
              <button className="btn btn-ghost btn-sm" disabled={busy || !acc || b.amount > acc.balance} onClick={() => run('billPay', { billId: b.id, accountId: acc!.id }, 'chime')}>
                {t('pay')}
              </button>
            </li>
          ))}
        </ul>

        {unpaid.length > 0 && (
          <div className="bl-payall" data-reveal>
            <span className="mono muted">{t('pay_from')}</span>
            <AccountPills accountId={acc?.id ?? ''} setAccountId={setAccountId} />
            <ErrorLine error={short ? t('err_short', { name: acc!.name, amount: money(due - acc!.balance) }) : error} />
            <HoldButton label={t('pay_all', { amount: money(due) })} disabled={busy || short || !acc} onConfirm={() => run('billPayAll', { accountId: acc!.id }, 'chime')} />
          </div>
        )}
      </div>

      <aside className="bl-history">
        <div className="section-head" data-reveal>
          <span className="mono muted">{t('paid')}</span>
          <span className="mono muted">{t('n_bills', { count: paid.length })}</span>
        </div>
        {paid.length ? (
          <ul className="tx-list">
            {paid.map((b) => (
              <li key={b.id} className={cfg.features.receipts ? 'tx tx-x' : 'tx'} data-reveal>
                <span className="tx-icon">
                  <Icon name="check" />
                </span>
                <span className="tx-main">
                  <span className="tx-label">{b.issuer}</span>
                  <span className="tx-sub">
                    {b.label} · {t('paid_on', { day: dayLabel(b.paidAt ?? b.issuedAt) })}
                  </span>
                </span>
                <span className="tx-amount num">{money(b.amount)}</span>
                {cfg.features.receipts && (
                  <button className="icon-btn" aria-label={t('print_receipt_for', { name: b.issuer })} data-sound="none" onClick={() => run('receiptPrint', { kind: 'bill', id: b.id }, 'printer')}>
                    <Icon name="print" size={1} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-note">{t('bills_empty')}</p>
        )}
      </aside>
    </div>
  );
}
