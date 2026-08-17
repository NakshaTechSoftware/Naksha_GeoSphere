package com.naksha.nmaps;

import android.Manifest;
import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.core.app.ActivityCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import java.io.IOException;
import java.io.OutputStream;

/**
 * Permissions behind the first-run consent screen:
 *
 *  1. GPS location (ACCESS_FINE/COARSE_LOCATION)
 *  2. Voice / microphone (RECORD_AUDIO)
 *  3. Phone storage - a persistent Storage Access Framework grant to a folder
 *     the user picks; exports are written into a "N-MAP_exports" subfolder there.
 *
 * The consent flow awaits {@link #request} (resolves only after Android has
 * finished showing the runtime permission dialogs), then opens the folder
 * picker - so the dialogs are never covered by the picker activity.
 *
 * The voice-search flow awaits {@link #ensureVoicePermission} before starting
 * recognition, guaranteeing the native RECORD_AUDIO grant exists when the
 * WebView asks for audio capture (see MainActivity's WebChromeClient, which
 * then grants the WebView request immediately).
 */
@CapacitorPlugin(
    name = "NativePermissions",
    permissions = {
        @Permission(
            alias = "location",
            strings = {
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
            }
        ),
        @Permission(alias = "voice", strings = { Manifest.permission.RECORD_AUDIO }),
    }
)
public class NativePermissionsPlugin extends Plugin {

    private static final String PREFS = "nmaps_permissions";
    private static final String KEY_EXPORT_TREE_URI = "export_tree_uri";
    private static final String KEY_SESSION = "nmaps_session";
    private static final String KEY_CONSENT = "nmaps_consent_accepted";
    public static final String EXPORT_FOLDER_NAME = "N-MAP_exports";

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /**
     * Requests the GPS + voice runtime permissions. The JS caller passes
     * { permissions: ["location", "voice"] }; resolves once Android has finished
     * showing the permission dialogs, with the per-permission state
     * (e.g. {"location": "granted", "voice": "granted"}) - the consent screen
     * uses this to open the folder picker only after the dialogs are done.
     */
    @PluginMethod
    public void request(PluginCall call) {
        requestPermissions(call);
    }

    /**
     * Ensures RECORD_AUDIO is granted before the WebView starts speech
     * recognition. Resolves {"granted": true} if already granted, otherwise
     * shows Android's microphone dialog and reports the outcome.
     */
    @PluginMethod
    public void ensureVoicePermission(PluginCall call) {
        if (getPermissionState("voice") == PermissionState.GRANTED) {
            call.resolve(new JSObject().put("granted", true));
        } else {
            requestPermissionForAlias("voice", call, "voicePermissionResult");
        }
    }

    @ActivityCallback
    private void voicePermissionResult(PluginCall call) {
        boolean granted = getPermissionState("voice") == PermissionState.GRANTED;
        call.resolve(new JSObject().put("granted", granted));
    }

    /** Opens the system folder picker; the chosen tree gets persistent access. */
    @PluginMethod
    public void pickExportFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        );
        startActivityForResult(call, intent, "pickExportFolderResult");
    }

    @ActivityCallback
    private void pickExportFolderResult(PluginCall call, ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            // Cancelling the picker is a normal user choice - resolve instead of
            // reject so the bridge doesn't log it as a console error.
            call.resolve(new JSObject().put("cancelled", true));
            return;
        }
        Uri treeUri = result.getData().getData();
        try {
            getContext().getContentResolver().takePersistableUriPermission(
                treeUri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            );
        } catch (SecurityException e) {
            // Some providers don't support persistable grants - still usable this session.
        }
        prefs().edit().putString(KEY_EXPORT_TREE_URI, treeUri.toString()).apply();
        call.resolve(new JSObject().put("uri", treeUri.toString()));
    }

    /** Persists the signed-in session (JSON) in SharedPreferences so it survives
     *  WebView storage being cleared when the app is closed or killed. */
    @PluginMethod
    public void setSession(PluginCall call) {
        String json = call.getString("json");
        if (json == null) {
            call.reject("json is required");
            return;
        }
        prefs().edit().putString(KEY_SESSION, json).apply();
        call.resolve();
    }

    /** Returns the persisted session JSON, or {"json": null} when signed out.
     *  Resolves (never rejects) for the no-session state: a rejected call makes
     *  the Capacitor bridge log a console.error, which the Next.js dev overlay
     *  in the app surfaces as a full-screen error. */
    @PluginMethod
    public void getSession(PluginCall call) {
        String json = prefs().getString(KEY_SESSION, null);
        call.resolve(new JSObject().put("json", json));
    }

    /** Clears the persisted session on sign-out. */
    @PluginMethod
    public void clearSession(PluginCall call) {
        prefs().edit().remove(KEY_SESSION).apply();
        call.resolve();
    }

    /** Persists the first-run consent flag natively (mirrors localStorage). */
    @PluginMethod
    public void setConsent(PluginCall call) {
        boolean accepted = call.getBoolean("accepted", false);
        prefs().edit().putBoolean(KEY_CONSENT, accepted).apply();
        call.resolve();
    }

    /** Returns {"accepted": true} if the user already accepted first-run consent. */
    @PluginMethod
    public void getConsent(PluginCall call) {
        boolean accepted = prefs().getBoolean(KEY_CONSENT, false);
        call.resolve(new JSObject().put("accepted", accepted));
    }

    /** Returns the persisted export-folder grant, or {"uri": null} when none.
     *  Resolves (never rejects) for the not-granted state - same reason as
     *  getSession: a rejection shows up as a console.error in the app. */
    @PluginMethod
    public void getExportFolder(PluginCall call) {
        String uri = prefs().getString(KEY_EXPORT_TREE_URI, null);
        call.resolve(new JSObject().put("uri", uri));
    }

    /**
     * Writes one exported file into "N-MAP_exports" under the granted tree.
     * Body carries the file as base64 (Capacitor bridge can't pass Blobs).
     */
    @PluginMethod
    public void saveToExportFolder(PluginCall call) {
        String filename = call.getString("filename");
        String base64 = call.getString("base64");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        if (filename == null || base64 == null) {
            call.reject("filename and base64 are required");
            return;
        }
        String treeUriString = prefs().getString(KEY_EXPORT_TREE_URI, null);
        if (treeUriString == null) {
            call.resolve(new JSObject().put("saved", false).put("reason", "no-folder"));
            return;
        }
        try {
            ContentResolver cr = getContext().getContentResolver();
            Uri treeUri = Uri.parse(treeUriString);
            Uri treeDoc = DocumentsContract.buildDocumentUriUsingTree(
                treeUri,
                DocumentsContract.getTreeDocumentId(treeUri)
            );
            Uri exportFolder = findOrCreateFolder(cr, treeDoc, EXPORT_FOLDER_NAME);
            Uri fileDoc = DocumentsContract.createDocument(cr, exportFolder, mimeType, filename);
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            try (OutputStream os = cr.openOutputStream(fileDoc, "w")) {
                if (os == null) throw new IOException("Could not open output stream");
                os.write(bytes);
            }
            call.resolve(new JSObject().put("saved", true).put("path", EXPORT_FOLDER_NAME + "/" + filename));
        } catch (Exception e) {
            // Resolve (not reject) so the app doesn't surface a console.error
            // overlay; the JS caller falls back to the share sheet.
            call.resolve(new JSObject().put("saved", false).put("reason", String.valueOf(e.getMessage())));
        }
    }

    /** Finds a directory child by name, creating it if missing. */
    private Uri findOrCreateFolder(ContentResolver cr, Uri parentDoc, String name) throws Exception {
        String parentId = DocumentsContract.getDocumentId(parentDoc);
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(parentDoc, parentId);
        try (Cursor c = cr.query(
                children,
                new String[] {
                    DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                    DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                    DocumentsContract.Document.COLUMN_MIME_TYPE,
                },
                null,
                null,
                null)) {
            if (c != null) {
                while (c.moveToNext()) {
                    String mime = c.getString(2);
                    if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)
                            && name.equals(c.getString(1))) {
                        return DocumentsContract.buildDocumentUriUsingTree(parentDoc, c.getString(0));
                    }
                }
            }
        }
        return DocumentsContract.createDocument(
            cr, parentDoc, DocumentsContract.Document.MIME_TYPE_DIR, name);
    }
}
