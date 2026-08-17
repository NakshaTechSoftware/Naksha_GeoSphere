import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { isNativeApp } from "./native";

/**
 * Bridge to the native NativePermissions plugin (see
 * android/app/src/main/java/com/naksha/nmaps/NativePermissionsPlugin.java).
 * Accessed through the global Capacitor bridge so the web bundle stays clean.
 */
function nativePermissionsPlugin(): {
  getExportFolder?: () => Promise<{ uri?: string }>;
  pickExportFolder?: () => Promise<{ uri?: string }>;
  saveToExportFolder?: (opts: {
    filename: string;
    base64: string;
    mimeType?: string;
  }) => Promise<{ saved?: boolean; path?: string; reason?: string }>;
} | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    Capacitor?: { Plugins?: { NativePermissions?: Record<string, unknown> } };
  };
  return w.Capacitor?.Plugins?.NativePermissions as ReturnType<typeof nativePermissionsPlugin>;
}

/** Reads a Blob into a base64 string (the Capacitor bridge passes strings, not blobs). */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read blob"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

/** The granted folder's URI, or null if the user hasn't picked one yet. */
async function getGrantedExportFolder(): Promise<string | null> {
  const plugin = nativePermissionsPlugin();
  if (!plugin?.getExportFolder) return null;
  try {
    const result = await plugin.getExportFolder();
    return result?.uri ?? null;
  } catch {
    return null; // not granted yet
  }
}

/** Opens the system folder picker; resolves with the picked URI or null on cancel. */
async function pickExportFolder(): Promise<string | null> {
  const plugin = nativePermissionsPlugin();
  if (!plugin?.pickExportFolder) return null;
  try {
    const result = await plugin.pickExportFolder();
    return result?.uri ?? null;
  } catch {
    return null; // user cancelled
  }
}

/**
 * Saves an exported file.
 *
 * - Native app (Capacitor WebView): saves the file straight into the
 *   "N-MAP_exports" folder under the folder the user granted on first run
 *   (consent screen) or first export. If no folder was granted yet, the
 *   system folder picker opens so the user picks where exports should live
 *   (the choice is remembered - it won't ask again). If the user dismisses
 *   the picker, we fall back to the OS share/save sheet (cache + share).
 * - Web / fallback: the usual browser download via a temporary <a download>.
 *
 * Returns which path was used (or "none" if nothing could be done).
 */
export async function saveExportFile(opts: {
  blob: Blob;
  filename: string;
  mimetype?: string;
}): Promise<"native-folder" | "native-share" | "web-download"> {
  const { blob, filename } = opts;

  if (isNativeApp()) {
    // 1) Preferred: write into the granted "N-MAP_exports" folder.
    let folderUri = await getGrantedExportFolder();
    if (!folderUri) {
      // 2) No grant yet - ask the user to pick a folder once.
      folderUri = await pickExportFolder();
    }
    if (folderUri) {
      const plugin = nativePermissionsPlugin();
      try {
        const base64 = await blobToBase64(blob);
        if (plugin?.saveToExportFolder) {
          const result = await plugin.saveToExportFolder({
            filename,
            base64,
            mimeType: opts.mimetype,
          });
          if (result?.saved !== false) {
            return "native-folder";
          }
        }
      } catch (error) {
        console.warn(
          "[nativeDownload] save to N-MAP_exports failed, falling back to share sheet:",
          error,
        );
      }
    }

    // 3) Fallback: write to the app cache and hand it to the OS share/save
    //    sheet so the user can still save it somewhere.
    try {
      const result = await Filesystem.writeFile({
        path: filename,
        data: blob,
        directory: Directory.Cache,
        recursive: true,
      });
      await Share.share({
        url: result.uri,
        title: filename,
        dialogTitle: "Save exported file",
      });
      return "native-share";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // A dismissed share sheet isn't a failure - the user simply chose not to
      // save, and the file is already written to cache.
      if (/cancel/i.test(message)) return "native-share";
      console.warn(
        "[nativeDownload] native save/share failed, falling back to browser download:",
        error,
      );
    }
  }

  // Web / fallback: standard download via a temporary anchor element.
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return "web-download";
  } finally {
    URL.revokeObjectURL(url);
  }
}
