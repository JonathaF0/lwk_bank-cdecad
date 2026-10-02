import { useMemo, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import type { Receipt, ReceiptView as View } from '../nui';
import { makeT } from '../i18n';
import { moneyFormat, safeLocale } from '../store';

/** A receipt item in the player's hand: prints out of a slot, click or Esc to put away. */
export function ReceiptView({ receipt: r, view, onClose }: { receipt: Receipt; view: View; onClose: () => void }) {
  const t = useMemo(() => makeT(view.ui), [view.ui]);
  const locale = safeLocale(view.intl);
  const money = useMemo(() => moneyFormat(locale, view.currency), [locale, view.currency]);
  const bank = r.bank || view.bankName || 'Bank';
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      // Stepped like a thermal printer feeding paper.
      gsap.fromTo('.slip', { yPercent: -100 }, { yPercent: 0, duration: 1.6, ease: 'steps(18)', delay: 0.35 });
    },
    { scope: root },
  );

  const rows: [string, string | undefined][] = r.at
    ? [
        [t('receipt_date'), new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(r.at)],
        [t('receipt_time'), new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(r.at)],
        [t('receipt_ref'), r.ref],
        [t('account'), r.account],
        [t('receipt_iban'), r.iban],
        [t('receipt_party'), r.party],
      ]
    : [];

  return (
    <div ref={root} className="slip-stage" data-stage onClick={onClose}>
      <div className="slip-slot" aria-hidden="true" />
      <div className="slip-feed">
        <article className="slip" role="document" aria-label={r.title} onClick={(e) => e.stopPropagation()}>
          <header className="slip-head">
            <span className="slip-mark" aria-hidden="true" />
            <strong>{bank}</strong>
            <span>{r.title}</span>
          </header>
          <dl className="slip-rows">
            {rows
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
          </dl>
          {r.label && <p className="slip-label">{r.label}</p>}
          {r.amount !== undefined && (
            <div className="slip-total">
              <span>{t('receipt_total')}</span>
              <strong>{money(r.incoming ? r.amount : -r.amount, { sign: true })}</strong>
            </div>
          )}
          <div className="slip-barcode" aria-hidden="true" />
          <p className="slip-thanks">{t('receipt_thanks', { bank })}</p>
        </article>
      </div>
      <p className="slip-hint mono">{t('receipt_hint')}</p>
    </div>
  );
}
