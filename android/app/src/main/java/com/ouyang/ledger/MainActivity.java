package com.ouyang.ledger;

import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;
import java.io.File;

public class MainActivity extends BridgeActivity {
    private static boolean purged;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        if (!purged) {
            purged = true;
            purgeWebCaches();
        }
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE);
        }
    }

    /** 覆盖安装不会清应用数据，旧页面会留在网页缓存里。只删缓存，不动账本。 */
    private void purgeWebCaches() {
        File data = getDataDir();
        deleteTree(new File(data, "app_webview/Default/Service Worker"));
        deleteTree(new File(data, "app_webview/Default/Cache"));
        deleteTree(new File(data, "app_webview/Default/Code Cache"));
        deleteTree(new File(data, "app_webview/Default/GPUCache"));
        deleteTree(new File(data, "app_webview/Service Worker"));
        deleteTree(new File(data, "cache/WebView"));
        File cache = getCacheDir();
        File[] children = cache.listFiles();
        if (children == null) return;
        for (File child : children) {
            String name = child.getName();
            if (name.startsWith("WebView") || name.contains("android_webview") || name.contains("chromium")) {
                deleteTree(child);
            }
        }
    }

    private static void deleteTree(File file) {
        if (file == null || !file.exists()) return;
        if (file.isDirectory()) {
            File[] kids = file.listFiles();
            if (kids != null) {
                for (File kid : kids) deleteTree(kid);
            }
        }
        file.delete();
    }
}
