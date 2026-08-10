import { useCallback, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import type { WorkflowStage } from "../../animation/workflowStages";
import type { StageHandler } from "../../animation/workflowTimeline";
import { STAGE_GROUP } from "../../animation/workflowStages";
import { useWorkflowController } from "../../animation/useWorkflowController";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { useVisibilityPause } from "../../hooks/useVisibilityPause";
import { GlobeMap, type GlobeMapHandle } from "./GlobeMap";
import { GlobeIntro } from "./GlobeIntro";
import { GeographyHighlight } from "./GeographyHighlight";
import { SearchBar } from "./SearchBar";
import { LayerPanel } from "./LayerPanel";
import { AOISelection } from "./AOISelection";
import { DataPanel } from "./DataPanel";
import { DatasetSelector } from "./DatasetSelector";
import { FormatSelector } from "./FormatSelector";
import { ExportPanel } from "./ExportPanel";
import { PaymentPanel } from "./PaymentPanel";
import { SecureProcessing } from "./SecureProcessing";
import { EmailDelivery } from "./EmailDelivery";
import { CompletionState } from "./CompletionState";
import { AnimatedCursor, type CursorHandle } from "./AnimatedCursor";
import { WorkflowStatus } from "./WorkflowStatus";
import { buildAOIPolygon, seedForCity } from "../../map/aoiGeometry";
import {
  GLOBE_START,
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

const STAGE_LABELS: Record<WorkflowStage, string> = {
  BOOT: "Preparing",
  GLOBE_INTRO: "Exploring Earth",
  ROTATE_TO_INDIA: "Flying to India",
  INDIA_FOCUS: "India",
  KARNATAKA_FOCUS: "Karnataka",
  LOCAL_FLY_IN: "Approaching location",
  LOCAL_MAP_READY: "Map ready",
  AOI_SELECTION: "Selecting area",
  DATA_DISCOVERY: "Finding data",
  FORMAT_SELECTION: "Choosing format",
  EXPORT_REQUEST: "Exporting data",
  PAYMENT: "Secure payment",
  SECURE_PROCESSING: "Preparing package",
  EMAIL_DELIVERY: "Delivering to email",
  DELIVERY_COMPLETE: "Delivered",
  RESET: "Resetting",
};

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
  const [layersVisible, setLayersVisible] = useState(false);
  const [layerChecks, setLayerChecks] = useState<Record<string, boolean>>({
    imagery: true,
    elevation: false,
  });
  const [aoiOverlay, setAoiOverlay] = useState(false);
  const [vertexCount, setVertexCount] = useState(0);
  const [areaLabel, setAreaLabel] = useState("");
  const [areaVisible, setAreaVisible] = useState(false);
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
  const [statusVisible, setStatusVisible] = useState(true);
  const [uiFade] = useState(true);

  const createHandlers = useCallback(
    (location: WorkflowLocation) => {
      const containerEl = containerRef.current;
      const handlers: Partial<Record<WorkflowStage, StageHandler>> = {};

      handlers.BOOT = ({ sub }) => {
        sub.set({}, {}).call(() => {
          setIntroVisible(true);
          setStatusVisible(false);
          const map = mapHandleRef.current;
          map?.flyTo(GLOBE_START, 0);
        });
      };

      handlers.GLOBE_INTRO = ({ sub, reducedMotion }) => {
        sub.call(() => {
          setIntroVisible(true);
          const map = mapHandleRef.current;
          map?.setProjection("globe");
          map?.flyTo(GLOBE_START, 0);
        }, [], 0);
        sub.to({}, { duration: reducedMotion ? 0.1 : 0.6 });
      };

      handlers.ROTATE_TO_INDIA = ({ sub }) => {
        sub.call(() => {
          const map = mapHandleRef.current;
          map?.showIndia();
          map?.flyTo(INDIA_TARGET, 1800);
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
          map?.easeTo(KARNATAKA_TARGET, 1400);
          setIndiaLabel(false);
          setKarnatakaLabel(true);
          setCrumbs(["India", "Karnataka"]);
        }, [], 0);
      };

      handlers.LOCAL_FLY_IN = ({ sub }) => {
        sub.call(() => {
          const map = mapHandleRef.current;
          map?.flyTo(localCityTarget(location), 2400);
          setKarnatakaLabel(true);
          setCrumbs(["India", "Karnataka", location.city]);
          setSearchVisible(true);
        }, [], 0);
        // Type the search text progressively.
        const full = location.label;
        const typingTl = gsap.timeline();
        typingTl.set({}, {});
        typingTl.call(() => setSearchTyping(true));
        typingTl.call(() => setSearchText(full), [], 0.1);
        typingTl.call(() => setSearchTyping(false), [], 1.8);
        sub.add(typingTl, 0.5);
      };

      handlers.LOCAL_MAP_READY = ({ sub }) => {
        sub.call(() => {
          setKarnatakaLabel(false);
          setCrumbs([]);
          setSearchTyping(false);
          setLayersVisible(true);
          setDataVisible(true);
          setDatasetsVisible(true);
          setStatusVisible(true);
        }, [], 0);
      };

      handlers.AOI_SELECTION = ({ sub, reducedMotion }) => {
        const geom = buildAOIPolygon(location.center, seedForCity(location.city));
        sub.call(() => {
          setAoiOverlay(true);
          setVertexCount(0);
          const map = mapHandleRef.current;
          map?.easeTo(aoiViewTarget(location), 800);
          const cursor = cursorRef.current;
          cursor?.show();
        }, [], 0);

        if (reducedMotion) {
          sub.call(() => {
            const map = mapHandleRef.current;
            map?.setAOIData(geom.feature, geom.vertices);
            setVertexCount(geom.vertices.length);
            setAreaLabel(`${formatAreaKm2(geom.areaSqKm)} km²`);
          }, [], 0);
          sub.call(() => setAreaVisible(true), [], 0.9);
        } else {
          // Draw the polygon point-by-point, like a real manual selection.
          const total = geom.vertices.length;
          const stepDur = 2.6 / total;
          geom.vertices.forEach((_, i) => {
            sub.call(
              () => {
                const map = mapHandleRef.current;
                map?.setAOIPartial(geom.vertices.slice(0, i + 1));
                setVertexCount(i + 1);
              },
            [],
            i * stepDur
          );
          });
          sub.call(() => {
            const map = mapHandleRef.current;
            map?.setAOIData(geom.feature, geom.vertices);
            setVertexCount(total);
            setAreaLabel(`${formatAreaKm2(geom.areaSqKm)} km²`);
            setAreaVisible(true);
          }, [], total * stepDur + 0.15);
          // Cursor click on the AOI button first.
          sub.call(() => {
            const cursor = cursorRef.current;
          const btn = findCursorTarget("aoi-button", containerEl);
          if (btn && cursor) {
            cursor.moveTo(btn.x, btn.y, 0.7);
            cursor.click();
          }
          }, [], 0);
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
          setLayerChecks((c) => ({ ...c, elevation: true }));
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
        sub.call(() => {
          setExportStage("summary");
          cursorRef.current?.hover(false);
        }, [], 0);
        sub.call(() => {
          const cursor = cursorRef.current;
          const target = findCursorTarget("continue", containerEl);
          if (target && cursor) {
            cursor.moveTo(target.x, target.y, 0.7);
            cursor.hover(true);
            cursor.click();
          }
        }, [], 0);
      };

      handlers.PAYMENT = ({ sub }) => {
        sub.call(() => {
          setExportVisible(false);
          setPaymentVisible(true);
          setPaymentStatus("idle");
          setPaymentMessage("");
          const cursor = cursorRef.current;
          const target = findCursorTarget("pay", containerEl);
          if (target && cursor) {
            cursor.moveTo(target.x, target.y, 0.7);
            cursor.hover(true);
            cursor.click();
          }
        }, [], 0);
        sub.call(() => {
          setPaymentStatus("processing");
          setPaymentMessage("Connecting securely…");
          cursorRef.current?.hover(false);
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

      handlers.RESET = ({ sub }) => {
        sub.call(() => {
          setCompleteVisible(false);
          setSearchVisible(false);
          setSearchText("");
          setLayersVisible(false);
          setDataVisible(false);
          setDatasetsVisible(false);
          setAoiOverlay(false);
          setVertexCount(0);
          setAreaVisible(false);
          setExportVisible(false);
          setPaymentVisible(false);
          setProcessingVisible(false);
          setEmailVisible(false);
          setSelectedDatasets([]);
          setFormats([]);
          setPriceVisible(false);
          setPriceLabel("");
          setLayerChecks({ imagery: true, elevation: false });
          const map = mapHandleRef.current;
          map?.clearAOI();
          map?.resetGeography();
          map?.flyTo(KARNATAKA_TARGET, 900);
          cursorRef.current?.hide();
        }, [], 0);
        sub.call(() => {
          const map = mapHandleRef.current;
          map?.flyTo(INDIA_TARGET, 900);
          map?.setProjection("globe");
        }, [], 0);
        sub.call(() => {
          const map = mapHandleRef.current;
          map?.flyTo(GLOBE_START, 1000);
        }, [], 0);
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

  // Surface the controller to the parent (review panel) once it exists.
  const onControllerReadyRef = useRef(onControllerReady);
  onControllerReadyRef.current = onControllerReady;
  const controllerExposed = useRef(false);
  if (controller.timeline && !controllerExposed.current) {
    controllerExposed.current = true;
    onControllerReadyRef.current?.(controller);
  }

  const currentStage = controller.stage;
  const stageGroup = STAGE_GROUP[currentStage];
  const stageLabel = STAGE_LABELS[currentStage];

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
      <div className={`${styles.uiLayer} ${uiFade ? "" : styles.uiFadeOut}`}>
        <GlobeIntro visible={introVisible} />
        <GeographyHighlight label="INDIA" crumbs={[]} visible={indiaLabel} position="center" />
        <GeographyHighlight
          label="Karnataka"
          crumbs={crumbs.length ? crumbs : ["India", "Karnataka"]}
          visible={karnatakaLabel}
          position="northwest"
        />
        <SearchBar visible={searchVisible} value={searchText} typing={searchTyping} />
        <LayerPanel visible={layersVisible} checked={layerChecks} />
        <AOISelection
          visible={aoiOverlay}
          vertexCount={vertexCount}
          areaLabel={areaLabel || areaLabelText}
          areaVisible={areaVisible}
        />
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
        <FormatSelector visible={formats.length > 0 && stageGroup === "data"} formats={formats} />
        <ExportPanel
          visible={exportVisible}
          stage={exportStage}
          packageName={pkgName}
          formats={formats}
          areaLabel={areaLabelText}
          priceLabel={priceLabel || formatINR(demoPrice(["imagery", "kml"]))}
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
        <WorkflowStatus visible={statusVisible} stageLabel={stageLabel} locationLabel={controller.location.city} />
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
