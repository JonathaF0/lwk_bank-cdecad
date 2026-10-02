import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useBank } from '../store';
import { Brand, CountUp, Scramble } from '../fx';
import type { BankConfig } from '../nui';
import { Overview } from './Overview';
import { Transfer } from './Transfer';
import { Activity } from './Activity';
import { Cards } from './Cards';
import { Savings } from './Savings';
import { Loans } from './Loans';
import { Bills } from './Bills';
import { Accounts } from './Accounts';

export type SectionId = 'overview' | 'transfer' | 'activity' | 'cards' | 'savings' | 'loans' | 'bills' | 'accounts';

export interface SectionProps {
  go: (id: SectionId) => void;
  accountId: string;
  setAccountId: (id: string) => void;
  active: boolean;
}

const ALL_SECTIONS: { id: SectionId; label: string; Comp: ComponentType<SectionProps>; flag?: keyof BankConfig['features'] }[] = [
  { id: 'overview', label: 'Overview', Comp: Overview },
  { id: 'transfer', label: 'Transfer', Comp: Transfer },
  { id: 'activity', label: 'Activity', Comp: Activity },
  { id: 'cards', label: 'Cards', Comp: Cards, flag: 'cards' },
  { id: 'savings', label: 'Savings', Comp: Savings, flag: 'savings' },
  { id: 'loans', label: 'Loans', Comp: Loans, flag: 'loans' },
  { id: 'bills', label: 'Bills', Comp: Bills, flag: 'bills' },
  { id: 'accounts', label: 'Accounts', Comp: Accounts, flag: 'accounts' },
];

/** Degrees between neighbouring panels on the ring. Radius lives in CSS (--ring-r). */
const STEP = 38;
const pad = (n: number) => String(n).padStart(2, '0');

export function Bank({ onClose }: { onClose: () => void }) {
  const { data, cfg, money } = useBank();
  const sections = useMemo(() => ALL_SECTIONS.filter((s) => !s.flag || cfg.features[s.flag]), [cfg.features]);
  const [activeId, setActiveId] = useState<SectionId>('overview');
  const active = Math.max(0, sections.findIndex((s) => s.id === activeId));
  const [accountId, setAccountId] = useState(data.accounts[0]?.id ?? '');
  const root = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLElement>(null);
  // Ring position in section units; tweened between sections.
  const pos = useRef({ v: active });
  const first = useRef(true);

  // A deleted account (or a fresh data push) can leave the selection dangling.
  useEffect(() => {
    if (!data.accounts.some((a) => a.id === accountId)) setAccountId(data.accounts[0]?.id ?? '');
  }, [data.accounts, accountId]);

  const go = (id: SectionId) => setActiveId(id);
  const goIndex = (i: number) => setActiveId(sections[Math.min(Math.max(i, 0), sections.length - 1)].id);

  // Each panel is angled by its own offset from the ring position, so the active one
  // rests at exactly 0deg. A ring rotated by hundreds of degrees renders fine but
  // breaks Chrome's hit-testing inside it - clicks fell through to the stage.
  const place = () =>
    root.current?.querySelectorAll<HTMLElement>('.slot').forEach((el) => {
      el.style.transform = `rotateY(${(Number(el.dataset.i) - pos.current.v) * STEP}deg) translateZ(var(--ring-r))`;
    });
  useLayoutEffect(place);

  // Swing to the section, then cascade the incoming panel's content.
  useGSAP(
    () => {
      gsap.to(pos.current, { v: active, duration: 1.15, ease: 'expo.inOut', onUpdate: place, overwrite: true });
      // fromTo with explicit end values: a plain from() started mid-fade (quick tab
      // switching) captures the half-faded state as its target and freezes there.
      gsap.fromTo(
        `.slot[data-i="${active}"] [data-reveal]`,
        { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: 0.7, stagger: 0.035, ease: 'power3.out', delay: first.current ? 0.55 : 0.45, overwrite: true, clearProps: 'opacity,transform' },
      );
      first.current = false;
    },
    { scope: root, dependencies: [active] },
  );

  // Tabs have different widths, so the highlight measures the current one.
  useLayoutEffect(() => {
    const measure = () => {
      const el = tabs.current?.querySelector<HTMLElement>('[aria-current="page"]');
      const bar = tabs.current?.querySelector<HTMLElement>('.tab-bar');
      if (el && bar) {
        bar.style.transform = `translateX(${el.offsetLeft}px)`;
        bar.style.width = `${el.offsetWidth}px`;
      }
    };
    measure();
    // Tab widths change once the web font swaps in.
    document.fonts.ready.then(measure);
  }, [active, sections]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || document.querySelector('dialog[open]')) return;
      if (e.key === 'ArrowRight') goIndex(active + 1);
      if (e.key === 'ArrowLeft') goIndex(active - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div ref={root} className="bank">
      <header className="hud hud-top">
        <Brand name={cfg.bankName} />


        <nav ref={tabs} className="tabs" aria-label="Bank sections" data-hud>
          {sections.map((s, i) => (
            <button key={s.id} className="tab" aria-current={i === active ? 'page' : undefined} onClick={() => goIndex(i)}>
              <span className="mono">{pad(i + 1)}</span>
              {s.label}
            </button>
          ))}
          <span className="tab-bar" aria-hidden="true" />
        </nav>

        <div className="who" data-hud>
          <span className="who-name">{data.player.name}</span>
          <span className="mono muted">
            Cash <CountUp value={data.player.cash} format={money} className="who-cash" />
          </span>
        </div>
      </header>

      <div className="stage" data-stage>
        <div className="ring-pivot">
          <div className="ring">
            {sections.map(({ id, label, Comp }, i) => {
              const dist = Math.abs(i - active);
              return (
                <section
                  key={id}
                  className="slot"
                  data-i={i}
                  data-dist={Math.min(dist, 2)}
                  aria-label={label}
                  aria-hidden={dist !== 0}
                  inert={dist !== 0}
                >
                  <Comp go={go} accountId={accountId} setAccountId={setAccountId} active={dist === 0} />
                </section>
              );
            })}
          </div>
        </div>
        {/* Side panels are inert; these catch clicks on them instead. */}
        {active > 0 && <button className="peek peek-left" aria-label={`Go to ${sections[active - 1].label}`} onClick={() => goIndex(active - 1)} />}
        {active < sections.length - 1 && (
          <button className="peek peek-right" aria-label={`Go to ${sections[active + 1].label}`} onClick={() => goIndex(active + 1)} />
        )}
      </div>

      <footer className="hud hud-bottom">
        <div className="mono" data-hud>
          <Scramble key={active} text={`${sections[active].label} · ${pad(active + 1)}/${pad(sections.length)}`} />
        </div>
        <div className="mono muted" data-hud>
          ← → Navigate
        </div>
        <button className="mono esc" onClick={onClose} data-hud>
          <kbd>Esc</kbd> Close
        </button>
      </footer>
    </div>
  );
}
