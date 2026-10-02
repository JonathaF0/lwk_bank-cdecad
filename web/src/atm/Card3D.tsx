import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Card } from '../nui';
import type { CardScene } from './card-scene';

export interface Card3DHandle {
  insert: () => Promise<void>;
}

/** Click to flip, move the pointer to tilt. three.js is fetched on first mount only. */
export const Card3D = forwardRef<Card3DHandle, { card: Card; bankName: string; accent: string; running?: boolean }>(function Card3D({ card, bankName, accent, running = true }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<CardScene | null>(null);
  // Repaint when the card or anything printed on it changes (e.g. a renewal moves the expiry).
  const face = `${card.id}:${card.expiresAt}:${card.holder}`;
  const shown = useRef(face);
  const [failed, setFailed] = useState(false);
  const runningRef = useRef(running);
  runningRef.current = running;

  useEffect(() => {
    let dead = false;
    import('./card-scene')
      .then(({ createCardScene }) => createCardScene(canvas.current!, card, bankName, accent))
      .then((s) => {
        if (dead) return s.dispose();
        scene.current = s;
        s.setRunning(runningRef.current);
      })
      .catch(() => !dead && setFailed(true));
    return () => {
      dead = true;
      scene.current?.dispose();
      scene.current = null;
    };
    // The scene is created once; card changes go through setCard below.
  }, []);

  useEffect(() => {
    scene.current?.setRunning(running);
  }, [running]);

  useEffect(() => {
    if (scene.current && shown.current !== face) scene.current.setCard(card);
    shown.current = face;
  }, [face, card]);

  useImperativeHandle(ref, () => ({ insert: () => scene.current?.insert() ?? Promise.resolve() }), []);

  return (
    <div className="card3d">
      {failed ? (
        // WebGL unavailable: flat fallback so the ATM still works.
        <div className={`card-flat tier-${card.tier}`}>
          <span>{bankName}</span>
          <span className="mono">•••• {card.last4}</span>
        </div>
      ) : (
        <canvas ref={canvas} onClick={() => scene.current?.flip()} aria-label={`${card.tier} card ending ${card.last4}. Click to flip.`} role="img" />
      )}
    </div>
  );
});
