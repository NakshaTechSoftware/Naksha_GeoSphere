"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import type { WorkflowStage } from "../../animation/workflowStages";
import type { StageHandler } from "../../animation/workflowTimeline";
import { useWorkflowController } from "../../animation/useWorkflowController";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { useVisibilityPause } from "../../hooks/useVisibilityPause";
import { GlobeMap, type GlobeMapHandle } from "./GlobeMap";
import { GlobeIntro } from "./GlobeIntro";
import { GeographyHighlight } from "./GeographyHighlight";
import { SearchBar } from "./SearchBar";
import { AOISelection } from "./AOISelection";
import { DataPanel } from "./DataPanel";
import { DatasetSelector } from "./DatasetSelector";
import { ExportPanel } from "./ExportPanel";
import { PaymentPanel } from "./PaymentPanel";
import { SecureProcessing } from "./SecureProcessing";
import { EmailDelivery } from "./EmailDelivery";
import { CompletionState } from "./CompletionState";
import { AnimatedCursor, type CursorHandle } from "./AnimatedCursor";
import { buildAOIPolygon, seedForCity } from "../../map/aoiGeometry";
import {
  GLOBE_START,
  GLOBE_SPIN_TARGET,
  INDIA_TARGET,
  KARNATAKA_TARGET,
  localCityTarget,
  aoiViewTarget,
} from "../../map/cameraSequence";
import { formatINR } from "../../data/pricing";
import { formatAreaKm2, exportPackageName } from "../../data/workflowDemo";
import { demoPrice } from "../../data/pricing";
import { getDataset } from "../../data/datasets";
import type { WorkflowLocation } from "../../data/locations";
import styles from "./GlobeWorkflow.module.css";

export interface GlobeWorkflowProps {
  autoPlay?: boolean;
  loop?: boolean;
  playbackRate?: number;
  startLocationIndex?: number;
  showPrototypeControls?: boolean;
  reducedMotion?: boolean;
  onStageChange?: (stage: WorkflowStage) => void;
  onLoopComplete?: (locationIndex: number) => void;
  /** Receives the internal workflow controller once built (drives the review panel). */
  onControllerReady?: (controller: ReturnType<typeof useWorkflowController>) => void;
  className?: string;
}

/**
 * The isolated cinematic workflow component. One GSAP timeline (useWorkflowController)
 * drives the map camera, the synthetic cursor, and the UI panels through the whole
 * customer journey, looping deterministically through real Karnataka locations.
 */
export function GlobeWorkflow(props: GlobeWorkflowProps) {
  const {
    autoPlay = true,
    loop = true,
    playbackRate = 1,
    startLocationIndex = 0,
    showPrototypeControls: _showPrototypeControls = true,
    reducedMotion: reducedMotionProp,
    onStageChange,
    onLoopComplete,
    onControllerReady,
    className,
  } = props;

  const osReduced = useReducedMotion();
  const reducedMotion = reducedMotionProp ?? osReduced;

  const containerRef = useRef<HTMLDivElement>(null);
  const mapHandleRef = useRef<GlobeMapHandle>(null);
  const cursorRef = useRef<CursorHandle>(null);

  // UI state driven by timeline callbacks.
  const [introVisible, setIntroVisible] = useState(true);
  const [indiaLabel, setIndiaLabel] = useState(false);
  const [karnatakaLabel, setKarnatakaLabel] = useState(false);
  const [crumbs, setCrumbs] = useState<string[]>([]);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchTyping, setSearchTyping] = useState(false);
  const [aoiOverlay, setAoiOverlay] = useState(false);
  const [vertexCount, setVertexCount] = useState(0);
  const [dataVisible, setDataVisible] = useState(false);
  const [selectedDatasets, setSelectedDatasets] = useState<string[]>([]);
  const [formats, setFormats] = useState<string[]>([]);
  const [priceLabel, setPriceLabel] = useState("");
  const [priceVisible, setPriceVisible] = useState(false);
  const [datasetsVisible, setDatasetsVisible] = useState(false);
  const [exportVisible, setExportVisible] = useState(false);
  const [exportStage, setExportStage] = useState<"button" | "summary">("button");
  const [paymentVisible, setPaymentVisible] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"idle" | "processing" | "verified">("idle");
  const [paymentMessage, setPaymentMessage] = useState("");
  const [processingVisible, setProcessingVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stepLabel, setStepLabel] = useState("Payment verified");
  const [emailVisible, setEmailVisible] = useState(false);
  const [emailStatus, setEmailStatus] = useState<"sending" | "sent">("sending");
  const [completeVisible, setCompleteVisible] = useState(false);

  const createHandlers = useCallback(
    (location: WorkflowLocation) => {
      const containerEl = containerRef.current;
      const handlers: Partial<Record<WorkflowStage, StageHandler>> = {};

      handlers.BOOT = ({ sub }) => {
        sub.set({}, {}).call(() => {
          setIntroVisible(true);
          // Clear any leftover local-stage UI (also covers manual Restart jumps).
          setAoiOverlay(false);
          setVertexCount(0);
          setDataVisible(false);
          setSearchVisible(false);
          const map = mapHandleRef.current;
          map?.clearAOI();
          map?.flyTo(GLOBE_START, 0);
        });
      };

      handlers.GLOBE_INTRO = ({ sub, reducedMotion }) => {
        sub.call(() => {
          setIntroVisible(true);
          const map = mapHandleRef.current;
          map?.setProjection("globe");
          // Open on the full globe with all continents visible, then let it spin slowly.
          map?.flyTo(GLOBE_START, 0);
          map?.easeTo(GLOBE_SPIN_TARGET, reducedMotion ? 0 : 1650);
        }, [], 0);
        sub.to({}, { duration: reducedMotion ? 0.1 : 0.5 });
      };

      handlers.ROTATE_TO_INDIA = ({ sub }) => {
        sub.call(() => {
          const map = mapHandleRef.current;
          map?.showIndia();
          // Rotate straight to the focused India view - no intermediate stop on the
          // globe-level India swing (removed the first pause).
          map?.easeTo({ ...INDIA_TARGET, zoom: 3.4 }, 2100);
          setIntroVisible(false);
          setIndiaLabel(true);
        }, [], 0);
      };

      handlers.INDIA_FOCUS = ({ sub }) => {
        sub.call(() => {
          const map = mapHandleRef.current;
          map?.showStates();
          map?.easeTo({ ...INDIA_TARGET, zoom: 3.4 }, 1200);
        }, [], 0);
      };

      handlers.KARNATAKA_FOCUS = ({ sub }) => {
        sub.call(() => {
          const map = mapHandleRef.current;
          map?.showKarnataka();
          map?.easeTo(KARNATAKA_TARGET, 800);
          setIndiaLabel(false);
          setKarnatakaLabel(true);
          setCrumbs(["India", "Karnataka"]);
        }, [], 0);
      };

      handlers.LOCAL_FLY_IN = ({ sub }) => {
        // Hold the Karnataka view: type "Karnataka, <City>" letter-by-letter (a bit
        // fast), and only then dive the camera to the city.
        const full = `${location.state}, ${location.city}`;
        const charDur = 0.05; // ~50ms per keystroke - fast but readable

        sub.call(() => {
          setKarnatakaLabel(true);
          setCrumbs(["India", "Karnataka", location.city]);
          setSearchVisible(true);
          setSearchText("");
          setSearchTyping(true);
        }, [], 0);

        // Letter-by-letter typing timeline (deterministic, no setInterval).
        const typingTl = gsap.timeline();
        full.split("").forEach((_, i) => {
          typingTl.call(() => setSearchText(full.slice(0, i + 1)), [], i * charDur);
        });
        typingTl.call(() => setSearchTyping(false), [], full.length * charDur + 0.2);
        // Padding so the typing sub has non-zero duration (fires under seek-driven tests).
        typingTl.to({}, { duration: 0.001, ease: "none" });
        sub.add(typingTl, 0.2);

        // After typing finishes, switch to the 2D map and dive to the city.
        const diveAt = 0.2 + full.length * charDur + 0.35;
        sub.call(() => {
          const map = mapHandleRef.current;
          // At this zoom the globe and Mercator projections align, so the switch is seamless.
          map?.setProjection("mercator");
          map?.flyTo(localCityTarget(location), 2000);
        }, [], diveAt);
      };

      handlers.LOCAL_MAP_READY = ({ sub }) => {
        sub.call(() => {
          setKarnatakaLabel(false);
          setCrumbs([]);
          setSearchTyping(false);
          setDatasetsVisible(true);
        }, [], 0);
      };

      handlers.AOI_SELECTION = ({ sub, reducedMotion }) => {
        const geom = buildAOIPolygon(location.center, seedForCity(location.city));
        // The "Draw AOI" button shows first; the cursor clicks it, then drawing begins.
        const clickAt = 0.7; // cursor reaches the button
        const drawStart = clickAt + 0.5; // drawing begins after the click registers

        sub.call(() => {
          setAoiOverlay(true);
          setVertexCount(0);
          const map = mapHandleRef.current;
          // Push the AOI toward the lower half of the rounded box (below the toolbar),
          // scaled to the container's real height so it never escapes the box.
          const boxH = containerEl?.getBoundingClientRect().height ?? 500;
          map?.easeTo(aoiViewTarget(location, boxH), 800);
          const cursor = cursorRef.current;
          cursor?.show();
        }, [], 0);

        // Cursor clicks the "Draw AOI" button (toolbar acts as the button).
        sub.call(() => {
          const cursor = cursorRef.current;
          const btn = findCursorTarget("aoi-button", containerEl);
          if (btn && cursor) {
            cursor.moveTo(btn.x, btn.y, 0.6);
            cursor.click();
          }
        }, [], clickAt);

        if (reducedMotion) {
          sub.call(() => {
            const map = mapHandleRef.current;
            map?.setAOIData(geom.feature, geom.vertices);
            map?.fitAOI(geom.bounds);
            setVertexCount(geom.vertices.length);
            // Selected Data panel appears only once the AOI has been drawn.
            setDataVisible(true);
          }, [], drawStart);
        } else {
          // Draw the polygon point-by-point, like a real manual selection: the cursor
          // glides to each vertex's on-map position and clicks there as it lays the edge.
          const total = geom.vertices.length;
          const stepDur = 2.4 / total;
          const travel = Math.min(0.28, stepDur * 0.45);
          geom.vertices.forEach((_, i) => {
            const t0 = drawStart + i * stepDur;
            sub.call(() => {
              const map = mapHandleRef.current;
              const cursor = cursorRef.current;
              const vertex = geom.vertices[i];
              if (map && cursor && vertex) {
                const p = map.projectPoint(vertex);
                cursor.moveTo(p.x, p.y, travel);
              }
            }, [], t0);
            sub.call(
              () => {
                const map = mapHandleRef.current;
                map?.setAOIPartial(geom.vertices.slice(0, i + 1));
                setVertexCount(i + 1);
                cursorRef.current?.click();
              },
              [],
              t0 + travel
            );
          });
          sub.call(() => {
            const map = mapHandleRef.current;
            map?.setAOIData(geom.feature, geom.vertices);
            // Keep the drawn AOI inside the rounded box (below the toolbar).
            map?.fitAOI(geom.bounds);
            setVertexCount(total);
            // Selected Data panel appears only once the AOI has finished drawing.
            setDataVisible(true);
          }, [], drawStart + total * stepDur + 0.15);
        }
      };

      handlers.DATA_DISCOVERY = ({ sub }) => {
        sub.call(() => {
          setSelectedDatasets(["imagery"]);
          setFormats(["GeoTIFF", "KML / KMZ"]);
          const price = demoPrice(["imagery", "kml"]);
          // Count-up the price.
          const counter = { v: 0 };
          gsap.to(counter, {
            v: price,
            duration: 1.2,
            ease: "power2.out",
            onUpdate: () => setPriceLabel(formatINR(Math.round(counter.v))),
            onComplete: () => {
              setPriceLabel(formatINR(price));
              setPriceVisible(true);
            },
          });
        }, [], 0);
      };

      handlers.FORMAT_SELECTION = ({ sub }) => {
        sub.call(() => {
          setSelectedDatasets(["imagery", "kml"]);
          setFormats(["KML / KMZ", "GeoTIFF"]);
          const cursor = cursorRef.current;
          const target = findCursorTarget("dataset-kml", containerEl);
          if (target && cursor) {
            cursor.moveTo(target.x, target.y, 0.7);
            cursor.hover(true);
            cursor.click();
          }
        }, [], 0);
        sub.call(() => cursorRef.current?.hover(false), [], 1.2);
      };

      handlers.EXPORT_REQUEST = ({ sub }) => {
        sub.call(() => {
          setExportVisible(true);
          setExportStage("button");
          const cursor = cursorRef.current;
          const target = findCursorTarget("export-button", containerEl);
          if (target && cursor) {
            cursor.moveTo(target.x, target.y, 0.7);
            cursor.hover(true);
            cursor.click();
          }
        }, [], 0);
        // Switch to the summary card AFTER the button click registers (React needs a
        // render cycle for the summary's DOM to exist).
        sub.call(() => {
          setExportStage("summary");
          cursorRef.current?.hover(false);
        }, [], 0.55);
        // Then glide the cursor to "Continue to Payment" and click it - scheduled after
        // the summary has rendered so the target element actually exists.
        sub.call(() => {
          const cursor = cursorRef.current;
          const target = findCursorTarget("continue", containerEl);
          if (target && cursor) {
            cursor.moveTo(target.x, target.y, 0.45);
            cursor.hover(true);
            cursor.click();
          }
        }, [], 0.7);
        // Once "Continue to Payment" is clicked the simulated cursor's job is done -
        // hide it for the rest of the journey (payment onwards).
        sub.call(() => cursorRef.current?.hide(), [], 1.0);
      };

      handlers.PAYMENT = ({ sub }) => {
        // The simulated cursor stays hidden from here on (hidden right after the
        // "Continue to Payment" click) - payment, processing and delivery run without it.
        sub.call(() => {
          setExportVisible(false);
          setPaymentVisible(true);
          setPaymentStatus("idle");
          setPaymentMessage("");
        }, [], 0);
        sub.call(() => {
          setPaymentStatus("processing");
          setPaymentMessage("Connecting securely…");
        }, [], 0);
        sub.call(() => setPaymentMessage("Processing payment…"), [], 1.2);
        sub.call(() => {
          setPaymentStatus("verified");
          setPaymentMessage("Payment verified ✓");
        }, [], 0);
      };

      handlers.SECURE_PROCESSING = ({ sub }) => {
        sub.call(() => {
          setPaymentVisible(false);
          setProcessingVisible(true);
          setProgress(0);
          setStepLabel("Payment verified");
          const counter = { v: 0 };
          gsap.to(counter, {
            v: 100,
            duration: 2.4,
            ease: "none",
            onUpdate: () => {
              setProgress(counter.v);
              const steps = [
                [0, "Payment verified"],
                [22, "Processing selected AOI"],
                [45, "Preparing geospatial layers"],
                [68, "Generating KML/KMZ"],
                [84, "Preparing imagery package"],
                [92, "Encrypting secure download"],
                [100, "Preparing delivery"],
              ] as const;
              const step = [...steps].reverse().find(([p]) => counter.v >= p);
              if (step) setStepLabel(step[1]);
            },
          });
        }, [], 0);
      };

      handlers.EMAIL_DELIVERY = ({ sub }) => {
        sub.call(() => {
          setProcessingVisible(false);
          setEmailVisible(true);
          setEmailStatus("sending");
        }, [], 0);
        sub.call(() => setEmailStatus("sent"), [], 1.6);
      };

      handlers.DELIVERY_COMPLETE = ({ sub }) => {
        sub.call(() => {
          setEmailVisible(false);
          setCompleteVisible(true);
        }, [], 0);
      };

      handlers.RESET = ({ sub, reducedMotion }) => {
        // Simple reset back to the initial state: the "Data Delivered Securely" card
        // fades out first; once it is fully gone, the map returns to the full globe and
        // the intro overlay fades in - exactly the state the component starts in.
        sub.call(() => setCompleteVisible(false), [], 0);

        // After the card has fully faded, clear all local-stage UI and bring the map
        // back to the globe view in one quick move (no staged pull-back).
        sub.call(() => {
          setSearchVisible(false);
          setSearchText("");
          setDataVisible(false);
          setDatasetsVisible(false);
          setAoiOverlay(false);
          setVertexCount(0);
          setExportVisible(false);
          setPaymentVisible(false);
          setProcessingVisible(false);
          setEmailVisible(false);
          setSelectedDatasets([]);
          setFormats([]);
          setPriceVisible(false);
          setPriceLabel("");
          const map = mapHandleRef.current;
          map?.clearAOI();
          map?.resetGeography();
          map?.setProjection("globe");
          map?.flyTo(GLOBE_START, reducedMotion ? 0 : 700);
          cursorRef.current?.hide();
        }, [], 0.6);

        // Fade the intro (initial state) back in once the globe view is restored.
        sub.call(() => setIntroVisible(true), [], 1.05);
      };

      return handlers;
    },
    []
  );

  const controller = useWorkflowController({
    autoPlay,
    loop,
    playbackRate,
    startLocationIndex,
    reducedMotion,
    createHandlers,
    onStageChange,
    onLoopComplete,
  });

  useVisibilityPause(controller.timeline, controller.isPlaying, containerRef);

  // Surface the controller to the parent (review panel) once it exists. Done in an
  // effect so the parent's setState never runs during this component's render.
  const onControllerReadyRef = useRef(onControllerReady);
  onControllerReadyRef.current = onControllerReady;
  const controllerExposed = useRef(false);
  useEffect(() => {
    if (controller.timeline && !controllerExposed.current) {
      controllerExposed.current = true;
      onControllerReadyRef.current?.(controller);
    }
  }, [controller]);

  const currentStage = controller.stage;

  const aoi = useMemo(
    () => buildAOIPolygon(controller.location.center, seedForCity(controller.location.city)),
    [controller.location]
  );
  const areaLabelText = useMemo(
    () => `${formatAreaKm2(aoi.areaSqKm)} km²`,
    [aoi]
  );
  const pkgName = useMemo(
    () => exportPackageName(controller.location.city),
    [controller.location.city]
  );

  // Render.
  const cursorVisible = !reducedMotion;

  return (
    <div
      ref={containerRef}
      className={`${styles.root} ${className ?? ""}`}
      data-workflow-stage={currentStage}
      data-testid="globe-workflow"
    >
      <GlobeMap ref={mapHandleRef} className={styles.mapCanvas} />

      {/* Overlays / panels (all decorative). */}
      <div className={styles.uiLayer}>
        <GlobeIntro visible={introVisible} />
        <GeographyHighlight label="INDIA" crumbs={[]} visible={indiaLabel} position="center" />
        <GeographyHighlight
          label="Karnataka"
          crumbs={crumbs.length ? crumbs : ["India", "Karnataka"]}
          visible={karnatakaLabel}
          position="northwest"
        />
        <SearchBar visible={searchVisible} value={searchText} typing={searchTyping} />
        <AOISelection visible={aoiOverlay} vertexCount={vertexCount} cursorTarget />
        <DataPanel
          visible={dataVisible}
          locationLabel={controller.location.label}
          areaLabel={areaLabelText}
          datasets={selectedDatasets.map((id) => getDataset(id).name)}
          formats={formats}
          priceLabel={priceLabel || formatINR(demoPrice(["imagery", "kml"]))}
          priceVisible={priceVisible}
        />
        <DatasetSelector visible={datasetsVisible} selected={selectedDatasets} />
        <ExportPanel
          visible={exportVisible}
          stage={exportStage}
          packageName={pkgName}
          formats={formats}
          areaLabel={areaLabelText}
          priceLabel={priceLabel || formatINR(demoPrice(["imagery", "kml"]))}
          cursorTarget
        />
        <PaymentPanel
          visible={paymentVisible}
          priceLabel={priceLabel || formatINR(demoPrice(["imagery", "kml"]))}
          packageName={pkgName}
          status={paymentStatus}
          message={paymentMessage}
        />
        <SecureProcessing visible={processingVisible} progress={progress} stepLabel={stepLabel} />
        <EmailDelivery visible={emailVisible} status={emailStatus} />
        <CompletionState visible={completeVisible} />
      </div>

      {cursorVisible && <AnimatedCursor ref={cursorRef} />}
    </div>
  );
}

/** Finds a cursor target element by data attribute and returns its center position
 * RELATIVE TO THE WORKFLOW CONTAINER (the cursor is absolutely positioned inside it). */
function findCursorTarget(id: string, container: HTMLElement | null): { x: number; y: number } | null {
  if (typeof document === "undefined" || !container) return null;
  const el = document.querySelector(`[data-cursor-target="${id}"]`);
  if (!el) return null;
  const rect = (el as HTMLElement).getBoundingClientRect();
  const crect = container.getBoundingClientRect();
  return {
    x: rect.left - crect.left + rect.width / 2,
    y: rect.top - crect.top + rect.height / 2,
  };
}
