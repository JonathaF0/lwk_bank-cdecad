import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import gsap from 'gsap';
import { useBank } from './store';

/* ---------- Scramble: mono labels decode into place ---------- */

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#/_+';

export function Scramble({ text, delay = 0, className }: { text: string; delay?: number; className?: string }) {
  const [out, setOut] = useState('');
  useEffect(() => {
    let frame = 0;
    let id: number | undefined;
    const start = window.setTimeout(() => {
      id = window.setInterval(() => {
        frame++;
        const settled = Math.floor(frame / 2);
        setOut(
          text
            .split('')
            .map((ch, i) => (i < settled || ch === ' ' ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0]))
            .join(''),
        );
        if (settled >= text.length) window.clearInterval(id);
      }, 28);
    }, delay * 1000);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(id);
    };
  }, [text, delay]);
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{out}</span>
    </span>
  );
}

/* ---------- Brand: "LWK Bank" -> big "LWK" + decoding "Bank" label ---------- */

export function Brand({ name, suffix }: { name: string; suffix?: string }) {
  const [head, ...rest] = name.trim().split(/\s+/);
  const label = [rest.join(' '), suffix].filter(Boolean).join(' · ');
  return (
    <div className="brand" data-hud>
      <span className="brand-mark" aria-hidden="true" />
      <span className="brand-name">{head}</span>
      {label && <Scramble className="mono muted" text={label} delay={0.5} />}
    </div>
  );
}
/* ---------- CountUp: numbers roll to their new value ---------- */

export function CountUp({ value, format, duration = 1.4, className }: { value: number; format: (n: number) => string; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);

  useLayoutEffect(() => {
    const o = { v: from.current };
    const draw = () => ref.current && (ref.current.textContent = format(Math.round(o.v)));
    draw();
    const t = gsap.to(o, { v: value, duration, ease: 'expo.out', onUpdate: draw, onComplete: () => (from.current = value) });
    return () => {
      from.current = o.v;
      t.kill();
    };
  }, [value, format, duration]);

  return (
    <span className={className}>
      <span className="sr-only">{format(value)}</span>
      <span ref={ref} aria-hidden="true" className="num" />
    </span>
  );
}

/* ---------- GridFloor: perspective grid receding to the horizon ---------- */

export function GridFloor() {
  return (
    <div className="grid-floor" aria-hidden="true">
      <div className="grid-plane">
        <div className="grid-lines" />
      </div>
    </div>
  );
}

/* ---------- HoldButton: press and hold to confirm money movement ---------- */

export function HoldButton({ label, onConfirm, disabled, duration = 1.1, variant }: { label: string; onConfirm: () => void; disabled?: boolean; duration?: number; variant?: 'danger' }) {
  const { t } = useBank();
  const btn = useRef<HTMLButtonElement>(null);
  const fill = useRef<HTMLSpanElement>(null);
  const progress = useRef({ p: 0 });
  const tween = useRef<gsap.core.Tween | null>(null);

  // The fill colour is part of the button's own background (a sliding hard-stop
  // gradient), not a layer on top: two stacked rounded layers leave a hairline of
  // the colour underneath along the anti-aliased edges. Only the inverted text is a layer.
  const paint = () => {
    const rest = (1 - progress.current.p) * 100;
    if (btn.current) btn.current.style.backgroundPosition = `${rest}% 0`;
    if (fill.current) fill.current.style.clipPath = `inset(0% ${rest}% 0% 0%)`;
  };
  const start = () => {
    if (disabled) return;
    tween.current?.kill();
    tween.current = gsap.to(progress.current, {
      p: 1,
      duration,
      ease: 'power1.in',
      onUpdate: paint,
      onComplete: () => {
        progress.current.p = 0;
        paint();
        onConfirm();
      },
    });
  };
  const cancel = () => {
    tween.current?.kill();
    tween.current = gsap.to(progress.current, { p: 0, duration: 0.3, ease: 'power2.out', onUpdate: paint });
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault();
      start();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') cancel();
  };

  useEffect(() => () => void tween.current?.kill(), []);

  return (
    <button
      ref={btn}
      type="button"
      className={`btn hold-btn ${variant === 'danger' ? 'hold-danger' : ''}`}
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
    >
      <span>{label}</span>
      <span className="mono">{t('hold')}</span>
      {/* Inverted copy revealed left-to-right as the hold progresses. */}
      <span ref={fill} className="hold-fill" aria-hidden="true">
        <span>{label}</span>
        <span className="mono">{t('hold')}</span>
      </span>
    </button>
  );
}

/* ---------- Icons ---------- */

const PATHS = {
  in: 'M17 7 7 17M7 9v8h8',
  out: 'M7 17 17 7M9 7h8v8',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  send: 'M4 12h14M13 6l6 6-6 6',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  check: 'M5 12.5 10 17 19 7',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
  x: 'M6 6l12 12M18 6 6 18',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  alert: 'M12 8v5M12 16.5v.5M12 3l9.5 17h-19Z',
  bill: 'M6 3h12v18l-3-2-3 2-3-2-3 2ZM9 8h6M9 12h6',
  pay: 'M3 7h18v12H3zM8 7V5h8v2M3 12h18',
  spark: 'M13 3 5 14h6l-1 7 8-11h-6Z',
  cash: 'M3 6h18v12H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0',
  card: 'M3 6h18v12H3zM3 10h18',
  lock: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  print: 'M7 9V3h10v6M6 17H4V9h16v8h-2M7 14h10v7H7z',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6 6 0 0 1 3.5 6',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 12h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
  gauge: 'M4 18a8 8 0 1 1 16 0M12 18l4-6',
  bank: 'M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 1.125 }: { name: IconName; size?: number }) {
  return (
    <svg width={`${size}rem`} height={`${size}rem`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
