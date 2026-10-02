import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { fetchNui, isBrowser, normalize, useNuiMessage, type BankData } from './nui';
import { BankProvider, useBank } from './store';
import { GridFloor, Icon } from './fx';
import { Bank } from './bank/Bank';
import { Atm } from './atm/Atm';
import { accentTokens } from './logic';
import { configureSound, play, preloadSounds, type SoundName } from './sound';

type Mode = 'bank' | 'atm';
// Browser dev toolbar; import.meta.env.DEV is false in the build, so it's never bundled.
const DevBar = import.meta.env.DEV ? lazy(() => import('./DevBar').then((m) => ({ default: m.DevBar }))) : null;
type Incoming = { id: number; amount: number; from: string };

export function App() {
  const [data, setData] = useState<BankData | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const scene = useRef<HTMLDivElement>(null);
  const intro = useRef<gsap.core.Timeline | null>(null);
  // useGSAP's revert also seeks the old intro back to 0, which fires onReverseComplete;
  // only a close we started may unmount.
  const closing = useRef(false);

  useNuiMessage((msg) => {
    if (msg.action === 'close') return close();
    if (msg.action === 'incoming') {
      play('chime');
      return setIncoming({ id: Date.now(), amount: msg.amount, from: msg.from });
    }
    if (!('data' in msg)) return;
    setData(normalize(msg.data));
    if (msg.action === 'open' || msg.action === 'openAtm') {
      const next = msg.action === 'open' ? 'bank' : 'atm';
      closing.current = false;
      // Re-opened mid close animation: play the intro forward again.
      if (next === mode && intro.current?.reversed()) intro.current.timeScale(1).play();
      if (!mode) play('open');
      setMode(next);
    }
  });

  // Intro: the world dims, the grid tilts up from the floor, the stage swings in.
  useGSAP(
    () => {
      if (!mode) return;
      intro.current = gsap
        .timeline({ defaults: { ease: 'expo.out' }, onReverseComplete: () => closing.current && setMode(null) })
        .from('.vignette', { opacity: 0, duration: 0.5, ease: 'power2.out' })
        .from('.grid-floor', { opacity: 0, duration: 0.8 }, 0.05)
        .from('.grid-plane', { rotateX: 90, duration: 1.4 }, 0.05)
        .from('[data-stage]', { opacity: 0, z: -900, rotateY: -18, duration: 1.3 }, 0.12)
        .from('[data-hud]', { opacity: 0, y: 8, duration: 0.6, stagger: 0.05, ease: 'power3.out' }, 0.45);
    },
    { scope: scene, dependencies: [mode], revertOnUpdate: true },
  );

  const close = useCallback(() => {
    if (!mode || closing.current) return;
    closing.current = true;
    play('close');
    fetchNui('close').catch(() => {});
    intro.current ? intro.current.timeScale(2.2).reverse() : setMode(null);
  }, [mode]);

  // Branding + sound settings come from the server owner's config.
  const config = data?.config;
  useEffect(() => {
    if (!config) return;
    const tokens = accentTokens(config.accent);
    if (tokens) for (const [k, v] of Object.entries(tokens)) document.documentElement.style.setProperty(k, v);
    configureSound(config.sound);
    if (config.sound.enabled) preloadSounds();
  }, [config]);

  // One delegated listener gives every button a press sound; data-sound picks another or "none".
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const btn = (e.target as Element).closest?.('button:not(:disabled), [role=switch]');
      if (!btn) return;
      const s = btn.getAttribute('data-sound');
      if (s !== 'none') play((s as SoundName) || 'tap');
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  useEffect(() => {
    if (!mode) return;
    const onKey = (e: KeyboardEvent) => {
      // A modal dialog handles its own Escape first.
      if (e.key === 'Escape' && !document.querySelector('dialog[open]')) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, close]);

  return (
    <>
      {DevBar && isBrowser && (
        <Suspense fallback={null}>
          <DevBar />
        </Suspense>
      )}
      {mode && data && (
        <BankProvider data={data} setData={setData}>
          <div ref={scene} className="scene">
            <div className="vignette" />
            <GridFloor />
            {mode === 'bank' ? <Bank onClose={close} /> : <Atm onClose={close} />}
            {incoming && <IncomingToast key={incoming.id} incoming={incoming} onDone={() => setIncoming(null)} />}
          </div>
        </BankProvider>
      )}
    </>
  );
}

/** "+$750 from Lena Park" while the bank is open; the client notifies instead when it's closed. */
function IncomingToast({ incoming, onDone }: { incoming: Incoming; onDone: () => void }) {
  const { money, t } = useBank();
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      gsap
        .timeline({ onComplete: onDone })
        .fromTo(ref.current, { y: -24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'expo.out' })
        .to(ref.current, { y: -24, opacity: 0, duration: 0.4, ease: 'power2.in' }, '+=3.2');
    },
    { scope: ref },
  );
  return (
    <div ref={ref} className="toast" role="status">
      <span className="tx-icon is-in">
        <Icon name="in" />
      </span>
      <span>
        <strong className="num">{money(incoming.amount, { sign: true })}</strong>
        <span className="muted"> {t('from_name', { name: incoming.from })}</span>
      </span>
    </div>
  );
}
