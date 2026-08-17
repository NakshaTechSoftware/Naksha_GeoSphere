/**
 * MOSDAC INSAT Cloud Animation System
 *
 * Provides smooth animation playback of sequential INSAT satellite cloud frames
 * Uses real satellite imagery with frame cycling controls
 */

import { recentMosdacTimes } from "./mosdacCloud";

export interface MosdacCloudFrame {
  time: string;
  path: string;
  timeIst: string;
  host: string;
}

export interface MosdacCloudAnimation {
  frames: MosdacCloudFrame[];
  currentIndex: number;
  isPlaying: boolean;
  speed: number; // 0.5, 1.0, 2.0
  getCurrentFrame(): MosdacCloudFrame | null;
  getPreviousFrame(): MosdacCloudFrame | null;
  getNextFrame(): MosdacCloudFrame | null;
  getLatestFrame(): MosdacCloudFrame | null;
  play(): void;
  pause(): void;
  next(): void;
  previous(): void;
  jumpToLatest(): void;
  setSpeed(speed: number): void;
}

export class MosdacCloudAnimator implements MosdacCloudAnimation {
  frames: MosdacCloudFrame[] = [];
  currentIndex: number = 0;
  isPlaying: boolean = false;
  speed: number = 1.0;
  private animationInterval: number | null = null;
  private onFrameChange?: (frame: MosdacCloudFrame | null) => void;

  constructor(frames: MosdacCloudFrame[]) {
    this.frames = frames.sort((a, b) => b.time.localeCompare(a.time)); // newest first
  }

  getCurrentFrame(): MosdacCloudFrame | null {
    return this.frames[this.currentIndex] || null;
  }

  getPreviousFrame(): MosdacCloudFrame | null {
    const prevIndex = this.currentIndex + 1;
    return prevIndex < this.frames.length ? this.frames[prevIndex] ?? null : null;
  }

  getNextFrame(): MosdacCloudFrame | null {
    const nextIndex = this.currentIndex - 1;
    return nextIndex >= 0 ? this.frames[nextIndex] ?? null : null;
  }

  getLatestFrame(): MosdacCloudFrame | null {
    return this.frames[0] || null;
  }

  play(): void {
    if (this.isPlaying) return;
    
    this.isPlaying = true;
    this.animationInterval = window.setInterval(() => {
      if (!this.isPlaying) return;
      
      const nextIndex = this.currentIndex + 1;
      if (nextIndex >= this.frames.length) {
        this.currentIndex = 0; // loop back to latest
      } else {
        this.currentIndex = nextIndex;
      }
      
      this.onFrameChange?.(this.getCurrentFrame());
    }, 1000 / this.speed);
  }

  pause(): void {
    this.isPlaying = false;
    if (this.animationInterval !== null) {
      clearInterval(this.animationInterval);
      this.animationInterval = null;
    }
  }

  next(): void {
    this.pause();
    if (this.currentIndex < this.frames.length - 1) {
      this.currentIndex++;
    }
    this.onFrameChange?.(this.getCurrentFrame());
  }

  previous(): void {
    this.pause();
    if (this.currentIndex > 0) {
      this.currentIndex--;
    }
    this.onFrameChange?.(this.getCurrentFrame());
  }

  jumpToLatest(): void {
    this.pause();
    this.currentIndex = 0;
    this.onFrameChange?.(this.getCurrentFrame());
  }

  setSpeed(speed: number): void {
    if (speed <= 0) throw new Error("Speed must be positive");
    this.speed = speed;
    if (this.animationInterval !== null) {
      this.pause();
      this.play();
    }
  }

  destroy(): void {
    this.pause();
    this.onFrameChange = undefined;
  }
}

// Utility function to create an animated cloud system
export function createMosdacCloudAnimation(
  frames: MosdacCloudFrame[],
  onFrameChange?: (frame: MosdacCloudFrame | null) => void
): MosdacCloudAnimation {
  return new MosdacCloudAnimator(frames);
}
