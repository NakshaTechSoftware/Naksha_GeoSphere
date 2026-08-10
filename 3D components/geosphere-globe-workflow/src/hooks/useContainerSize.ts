import { useEffect, useState } from "react";
import type { RefObject } from "react";

export interface ContainerSize {
  width: number;
  height: number;
}

/** Tracks an element's size via ResizeObserver (no layout thrash). */
export function useContainerSize(ref: RefObject<HTMLElement | null>): ContainerSize {
  const [size, setSize] = useState<ContainerSize>({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return size;
}
