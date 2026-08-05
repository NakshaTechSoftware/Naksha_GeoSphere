import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ShoppingCart } from "lucide-react";
import { currencyFormatter } from "@/data/mockDatasets";
import { DEMO_RESOLUTION_LABEL } from "@/data/mockWorkflow";
import styles from "./GeoWorkflowDemo.module.css";

function useCountUp(target: number, durationSeconds = 0.5) {
  const [value, setValue] = useState(target);
  const proxyRef = useRef({ value: target });

  useEffect(() => {
    const tween = gsap.to(proxyRef.current, {
      value: target,
      duration: durationSeconds,
      ease: "power1.out",
      onUpdate: () => setValue(proxyRef.current.value),
    });
    return () => {
      tween.kill();
    };
  }, [target, durationSeconds]);

  return value;
}

export type SelectedDataPanelProps = {
  selectedDatasetIds: string[];
  aoiAreaSqKm: number;
  totalPrice: number;
  cartBadge: number;
  cartButtonLabel: "Add to Cart" | "Added to Cart" | "Proceed Securely";
};

const LABELS: Record<string, string> = { imagery: "Imagery", elevation: "Elevation" };

export function SelectedDataPanel({
  selectedDatasetIds,
  aoiAreaSqKm,
  totalPrice,
  cartBadge,
  cartButtonLabel,
}: SelectedDataPanelProps) {
  const animatedArea = useCountUp(aoiAreaSqKm);
  const animatedPrice = useCountUp(totalPrice);

  return (
    <aside className={styles.selectedDataPanel} aria-hidden="true">
      <div className={styles.selectedDataHeader}>
        <h3 className={styles.panelHeading}>Selected Data</h3>
        <span className={styles.cartBadgeWrap}>
          <ShoppingCart size={16} strokeWidth={2} />
          {cartBadge > 0 && <span className={styles.cartBadge}>{cartBadge}</span>}
        </span>
      </div>

      <div className={styles.selectedField}>
        <span className={styles.selectedFieldLabel}>Layers</span>
        <div className={styles.tagRow}>
          {selectedDatasetIds.length === 0 && <span className={styles.tagEmpty}>—</span>}
          {selectedDatasetIds.map((id) => (
            <span key={id} className={styles.tag}>
              {LABELS[id] ?? id}
            </span>
          ))}
        </div>
      </div>

      <div className={styles.selectedField}>
        <span className={styles.selectedFieldLabel}>Area</span>
        <span className={styles.selectedFieldValue}>{animatedArea.toFixed(2)} km²</span>
      </div>

      <div className={styles.selectedField}>
        <span className={styles.selectedFieldLabel}>Resolution</span>
        <span className={styles.selectedFieldValue}>{DEMO_RESOLUTION_LABEL}</span>
      </div>

      <div className={styles.selectedField}>
        <span className={styles.selectedFieldLabel}>Total Price</span>
        <span className={styles.selectedFieldValuePrice}>{currencyFormatter.format(animatedPrice)}</span>
      </div>

      <button type="button" className={styles.addToCartButton} tabIndex={-1}>
        {cartButtonLabel}
      </button>
    </aside>
  );
}
