import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildWorkflowTimeline, type StageHandler } from "./workflowTimeline";
import { WORKFLOW_STAGES, STAGE_ORDER, type WorkflowStage } from "./workflowStages";
import { STAGE_START_TIMES } from "./workflowDurations";
import {
  getLocationForLoop,
  type WorkflowLocation,
} from "../data/locations";

export interface WorkflowControllerArgs {
  autoPlay: boolean;
  loop: boolean;
  playbackRate: number;
  startLocationIndex: number;
  reducedMotion: boolean;
  /** Builds the per-loop stage handlers for a given location. */
  createHandlers: (location: WorkflowLocation) => Partial<Record<WorkflowStage, StageHandler>>;
  onStageChange?: (stage: WorkflowStage) => void;
  onLoopComplete?: (locationIndex: number) => void;
}

export interface WorkflowController {
  stage: WorkflowStage;
  locationIndex: number;
  location: WorkflowLocation;
  loopCount: number;
  isPlaying: boolean;
  isLooping: boolean;
  playbackRate: number;
  timelinePosition: number; // 0..1
  elapsedSeconds: number;
  fps: number;
  timeline: gsap.core.Timeline | null;
  controls: {
    play: () => void;
    pause: () => void;
    togglePlay: () => void;
    restart: () => void;
    nextStage: () => void;
    prevStage: () => void;
    seekToStage: (stage: WorkflowStage) => void;
    setPlaybackRate: (rate: number) => void;
    setLooping: (loop: boolean) => void;
    setLocationIndex: (index: number) => void;
  };
}

/**
 * The single source of truth for workflow timing. Holds ONE paused GSAP timeline, rebuilt
 * (cheaply) when the loop location changes. Nothing else in the app decides timing.
 */
export function useWorkflowController(args: WorkflowControllerArgs): WorkflowController {
  const {
    autoPlay,
    loop: loopArg,
    playbackRate: rateArg,
    startLocationIndex,
    reducedMotion,
    createHandlers,
    onStageChange,
    onLoopComplete,
  } = args;

  const [locationIndex, setLocationIndexState] = useState(startLocationIndex);
  const [stage, setStage] = useState<WorkflowStage>("BOOT");
  const [loopCount, setLoopCount] = useState(0);
  const [isLooping, setIsLooping] = useState(loopArg);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [playbackRate, setPlaybackRateState] = useState(rateArg);
  const [timelinePosition, setTimelinePosition] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [fps, setFps] = useState(0);
  const [timeline, setTimeline] = useState<gsap.core.Timeline | null>(null);

  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const stageRef = useRef<WorkflowStage>("BOOT");
  const loopRef = useRef(isLooping);
  const locationIndexRef = useRef(locationIndex);
  const reducedMotionRef = useRef(reducedMotion);
  const onStageChangeRef = useRef(onStageChange);
  const onLoopCompleteRef = useRef(onLoopComplete);
  const createHandlersRef = useRef(createHandlers);
  const userPausedRef = useRef(false);
  const loopRafRef = useRef<number | null>(null);

  useEffect(() => { loopRef.current = isLooping; }, [isLooping]);
  useEffect(() => { locationIndexRef.current = locationIndex; }, [locationIndex]);
  useEffect(() => { reducedMotionRef.current = reducedMotion; }, [reducedMotion]);
  useEffect(() => { onStageChangeRef.current = onStageChange; }, [onStageChange]);
  useEffect(() => { onLoopCompleteRef.current = onLoopComplete; }, [onLoopComplete]);
  useEffect(() => { createHandlersRef.current = createHandlers; }, [createHandlers]);

  const buildAndStart = useCallback((startPlaying: boolean) => {
    const idx = locationIndexRef.current;
    const location = getLocationForLoop(idx);
    const tl = buildWorkflowTimeline({
      handlers: createHandlersRef.current(location),
      location,
      reducedMotion: reducedMotionRef.current,
      onStageChange: (s) => {
        stageRef.current = s;
        setStage(s);
        onStageChangeRef.current?.(s);
      },
      onLoopComplete: () => {
        if (loopRef.current && !reducedMotionRef.current) {
          // Next loop, next location.
          setLoopCount((c) => c + 1);
          setLocationIndexState((i) => i + 1);
          locationIndexRef.current += 1;
          const nextIdx = locationIndexRef.current;
          onLoopCompleteRef.current?.(nextIdx);
          // Rebuild on the next frame to avoid setState-during-complete issues.
          loopRafRef.current = requestAnimationFrame(() => {
            loopRafRef.current = null;
            buildAndStart(true);
          });
        } else {
          setIsPlaying(false);
          userPausedRef.current = false;
        }
      },
      onTick: (time, progress) => {
        setElapsedSeconds(time);
        setTimelinePosition(progress);
      },
    });
    tl.timeScale(playbackRate);
    if (startPlaying) {
      tl.play();
      setIsPlaying(true);
    } else {
      tl.pause();
      setIsPlaying(false);
    }
    timelineRef.current = tl;
    setTimeline(tl);
    return tl;
  }, [playbackRate]);

  // (Re)build on mount / when reducedMotion flips.
  useEffect(() => {
    const tl = buildAndStart(autoPlay);
    return () => {
      if (loopRafRef.current !== null) {
        cancelAnimationFrame(loopRafRef.current);
        loopRafRef.current = null;
      }
      tl.kill();
      timelineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  // FPS approximation while playing.
  useEffect(() => {
    if (!isPlaying) return;
    let frames = 0;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      setFps(Math.round(frames / dt));
      frames = 0;
    }, 1000);
    const tick = () => { frames += 1; requestAnimationFrame(tick); };
    const raf = requestAnimationFrame(tick);
    return () => { clearInterval(id); cancelAnimationFrame(raf); };
  }, [isPlaying]);

  const controls = useMemo(() => {
    const play = () => {
      const tl = timelineRef.current;
      if (tl) { userPausedRef.current = false; tl.play(); setIsPlaying(true); }
    };
    const pause = () => {
      const tl = timelineRef.current;
      if (tl) { tl.pause(); setIsPlaying(false); }
    };
    const restart = () => {
      buildAndStart(true);
      userPausedRef.current = false;
    };
    const seekToStage = (s: WorkflowStage) => {
      const tl = timelineRef.current;
      if (!tl) return;
      tl.pause();
      tl.seek(STAGE_START_TIMES[s]);
      stageRef.current = s;
      setStage(s);
      setIsPlaying(false);
      userPausedRef.current = false;
    };
    const stepStage = (dir: 1 | -1) => {
      const current = stageRef.current;
      const idx = STAGE_ORDER[current];
      const next = WORKFLOW_STAGES[Math.max(0, Math.min(WORKFLOW_STAGES.length - 1, idx + dir))];
      seekToStage(next);
    };
    const setLocationIndex = (index: number) => {
      setLocationIndexState(index);
      locationIndexRef.current = index;
      setLoopCount(0);
      buildAndStart(true);
    };
    const setPlaybackRate = (rate: number) => {
      setPlaybackRateState(rate);
      const tl = timelineRef.current;
      if (tl) tl.timeScale(rate);
    };
    const setLooping = (loop: boolean) => {
      setIsLooping(loop);
      loopRef.current = loop;
    };

    return {
      play,
      pause,
      togglePlay: () => (timelineRef.current?.paused() ? play() : pause()),
      restart,
      nextStage: () => stepStage(1),
      prevStage: () => stepStage(-1),
      seekToStage,
      setPlaybackRate,
      setLooping,
      setLocationIndex,
    };
  }, [buildAndStart]);

  const location = useMemo(() => getLocationForLoop(locationIndex), [locationIndex]);

  return {
    stage,
    locationIndex,
    location,
    loopCount,
    isPlaying,
    isLooping,
    playbackRate,
    timelinePosition,
    elapsedSeconds,
    fps,
    timeline,
    controls,
  };
}
