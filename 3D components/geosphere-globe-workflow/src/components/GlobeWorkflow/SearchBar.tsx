import { Search } from "lucide-react";
import styles from "./GlobeWorkflow.module.css";

interface Props {
  visible: boolean;
  /** Text currently displayed (animated typing by parent). */
  value: string;
  typing: boolean;
  cursorTarget?: boolean;
}

/** The approved white pill search bar, animated in with the LOCAL_MAP_READY stage. */
export function SearchBar({ visible, value, typing, cursorTarget }: Props) {
  return (
    <div
      className={`${styles.searchBar} ${visible ? styles.searchBarVisible : ""}`}
      data-cursor-target={cursorTarget ? "search" : undefined}
      aria-hidden={!visible}
    >
      <div className={styles.searchBarIcon}>
        <Search size={15} strokeWidth={2.4} />
      </div>
      <span className={styles.searchBarText}>{value}</span>
      {typing && <span className={styles.searchCaret} />}
      {!typing && value && <span className={styles.searchClear}>×</span>}
    </div>
  );
}
