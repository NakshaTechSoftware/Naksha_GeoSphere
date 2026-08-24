"use client";

import { useEffect, useState } from "react"
import { createMosdacCloudAnimation, type MosdacCloudFrame } from "@/lib/weather/mosdacCloudAnimation"
import { recentMosdacTimes } from "@/lib/weather/mosdacCloud"

interface CloudAnimationUIState {
  frames: MosdacCloudFrame[]
  currentFrame: MosdacCloudFrame | null
  isPlaying: boolean
  speed: number
  availableDates: string[]
  isLoading: boolean
  error: string | null
  isAutoscrolling: boolean
}

export function useMosdacCloudAnimation(
  initialDayNight: "day" | "night",
  onFrameChange?: (frame: MosdacCloudFrame | null) => void
) {
  const [uiState, setUiState] = useState<CloudAnimationUIState>({
    frames: [],
    currentFrame: null,
    isPlaying: false,
    speed: 1.0,
    availableDates: [],
    isLoading: false,
    error: null,
    isAutoscrolling: true,
  })

  // Fetch frames for both day and night
  useEffect(() => {
    let cancelled = false
    
    const loadFrames = async () => {
      setUiState(prev => ({ ...prev, isLoading: true, error: null }))
      
      try {
        // Use recent dates as frame references
        const times = recentMosdacTimes(6)
        const mockFrames: MosdacCloudFrame[] = times.map((time, index) => ({
          time,
          path: `/images/mosdac/clouds/${time}.png`,
          timeIst: new Date(time).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            hour: "2-digit",
            minute: "2-digit",
            day: "numeric",
            month: "short",
          }),
          host: "https://geoserver.mosdac.gov.in",
        }))
        
        if (!cancelled) {
          const animation = createMosdacCloudAnimation(mockFrames, (frame) => {
            onFrameChange?.(frame)
            setUiState(prev => ({ ...prev, currentFrame: frame }))
          })
          
          setUiState(prev => ({
            ...prev,
            frames: mockFrames,
            currentFrame: animation.getCurrentFrame(),
            isPlaying: animation.isPlaying,
          }))
          
          if (animation.isPlaying) {
            setUiState(prev => ({ ...prev, isPlaying: true }))
          }
        }
      } catch (error) {
        if (!cancelled) {
          const errorMessage = error instanceof Error ? error.message : "Failed to load cloud frames"
          setUiState(prev => ({ ...prev, error: errorMessage, isLoading: false }))
        }
      }
    }
    
    void loadFrames()
    
    return () => {
      cancelled = true
    }
  }, [initialDayNight, onFrameChange])

  const play = () => {
    setUiState(prev => ({ ...prev, isPlaying: true }))
  }

  const pause = () => {
    setUiState(prev => ({ ...prev, isPlaying: false }))
  }

  const next = () => {
    setUiState(prev => {
      const currentIndex = prev.currentFrame ? prev.frames.indexOf(prev.currentFrame) : -1
      const newIndex = currentIndex + 1
      return {
        ...prev,
        currentFrame: newIndex < prev.frames.length ? prev.frames[newIndex] ?? null : prev.frames[0] ?? null,
      }
    })
  }

  const previous = () => {
    setUiState(prev => {
      const currentIndex = prev.currentFrame ? prev.frames.indexOf(prev.currentFrame) : -1
      const newIndex = currentIndex > 0 ? currentIndex - 1 : prev.frames.length - 1
      return {
        ...prev,
        currentFrame: prev.frames[newIndex] ?? null,
      }
    })
  }

  const jumpToLatest = () => {
    setUiState(prev => ({
      ...prev,
      currentFrame: prev.frames[0] ?? null,
    }))
  }

  const setSpeed = (speed: number) => {
    setUiState(prev => ({ ...prev, speed }))
  }

  const setAutoscroll = (enabled: boolean) => {
    setUiState(prev => ({ ...prev, isAutoscrolling: enabled }))
  }

  return {
    ...uiState,
    play,
    pause,
    next,
    previous,
    jumpToLatest,
    setSpeed,
    setAutoscroll,
  }
}
