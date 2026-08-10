import { forwardRef, useImperativeHandle, useRef } from "react";
import gsap from "gsap";
import styles from "./GlobeWorkflow.module.css";

export interface CursorHandle {
  moveTo: (x: number, y: number, duration?: number) => void;
  hover: (active: boolean) => void;
  click: () => void;
  hide: () => void;
  show: () => void;
}

/** A small professional Obsidian cursor with a white edge. Pure decoration (aria-hidden). */
export const AnimatedCursor = forwardRef<CursorHandle>(function AnimatedCursor(_, ref) {
  const elRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const visibleRef = useRef(true);

  useImperativeHandle(ref, () => ({
    moveTo: (x, y, duration = 0.8) => {
      if (!elRef.current) return;
      if (!visibleRef.current) return;
      gsap.to(elRef.current, {
        x,
        y,
        duration,
        ease: "power2.inOut",
        overwrite: "auto",
      });
    },
    hover: (active) => {
      if (!elRef.current) return;
      gsap.to(elRef.current, {
        scale: active ? 1.35 : 1,
        duration: 0.25,
        ease: "power2.out",
      });
    },
    click: () => {
      if (!elRef.current || !ringRef.current) return;
      gsap.fromTo(
        elRef.current,
        { scale: 1 },
        { scale: 0.88, duration: 0.12, yoyo: true, repeat: 1, ease: "power2.inOut" }
      );
      const ring = ringRef.current;
      gsap.fromTo(
        ring,
        { opacity: 0.9, scale: 0.6 },
        { opacity: 0, scale: 1.9, duration: 0.5, ease: "power2.out" }
      );
    },
    hide: () => {
      visibleRef.current = false;
      if (elRef.current) gsap.to(elRef.current, { opacity: 0, duration: 0.2 });
    },
    show: () => {
      visibleRef.current = true;
      if (elRef.current) gsap.to(elRef.current, { opacity: 1, duration: 0.2 });
    },
  }));

  return (
    <div ref={elRef} className={styles.cursor} aria-hidden="true" style={{ opacity: 0 }}>
      <div ref={ringRef} className={styles.cursorRing} />
    </div>
  );
});
