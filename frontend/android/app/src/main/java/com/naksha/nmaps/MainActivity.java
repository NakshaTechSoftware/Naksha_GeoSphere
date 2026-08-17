package com.naksha.nmaps;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import java.util.Arrays;
import java.util.List;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativePermissionsPlugin.class);
        super.onCreate(savedInstanceState);
        // The WebView's own permission requests (e.g. the Web Speech API's audio
        // capture) are granted immediately whenever the corresponding native
        // permission is already held. Capacitor's default re-launches the system
        // permission dialog, which - if it races the consent flow or is dismissed -
        // leaves the WebView with a cached denial that makes voice search fail
        // with "Microphone access was denied" even after the user granted access.
        if (bridge != null) {
            WebView webView = bridge.getWebView();
            if (webView != null) {
                webView.setWebChromeClient(new PreGrantingWebChromeClient(bridge));
            }
        }
    }

    /** Grants WebView audio capture directly when RECORD_AUDIO is already granted. */
    private static class PreGrantingWebChromeClient extends BridgeWebChromeClient {
        private final Bridge bridge;

        PreGrantingWebChromeClient(Bridge bridge) {
            super(bridge);
            this.bridge = bridge;
        }

        @Override
        public void onPermissionRequest(PermissionRequest request) {
            List<String> resources = Arrays.asList(request.getResources());
            boolean audioOk = !resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                    || ActivityCompat.checkSelfPermission(
                            bridge.getContext(), Manifest.permission.RECORD_AUDIO)
                        == PackageManager.PERMISSION_GRANTED;
            boolean videoOk = !resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
                    || ActivityCompat.checkSelfPermission(
                            bridge.getContext(), Manifest.permission.CAMERA)
                        == PackageManager.PERMISSION_GRANTED;
            if (audioOk && videoOk) {
                request.grant(request.getResources());
            } else {
                // Not natively granted yet - fall back to Capacitor's normal
                // (dialog-based) permission flow.
                super.onPermissionRequest(request);
            }
        }
    }
}
