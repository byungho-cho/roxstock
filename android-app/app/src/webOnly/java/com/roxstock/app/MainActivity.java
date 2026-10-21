package com.roxstock.app;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;

/** Web-only build: no notification service, database, native message bridge or badge. */
public final class MainActivity extends Activity {
    private WebView web;

    private boolean trusted(Uri uri) {
        Uri origin = Uri.parse(BuildConfig.SITE_ORIGIN);
        return "https".equals(uri.getScheme()) && origin.getHost().equals(uri.getHost())
            && origin.getPort() == uri.getPort() && uri.getUserInfo() == null;
    }

    private void openBrowser(Uri uri) { ExternalBrowser.open(this, uri); }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout root = new LinearLayout(this);
        AppWindowInsets.install(this, root);
        web = new WebView(this);
        root.addView(web, new LinearLayout.LayoutParams(-1, -1));
        setContentView(root);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.getSettings().setUserAgentString(web.getSettings().getUserAgentString() + " RoxStockWebOnly/" + BuildConfig.VERSION_NAME);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (trusted(request.getUrl())) return false;
                if (request.isForMainFrame()) openBrowser(request.getUrl());
                return true;
            }
        });
        web.setDownloadListener((url, userAgent, disposition, mime, size) -> {
            Uri uri = Uri.parse(url);
            if (trusted(uri)) openBrowser(uri);
        });
        // Debug-only blank launch lets USB tests attach before any production request.
        final boolean blankTest = BuildConfig.DEBUG && getIntent().getBooleanExtra("auth_test_blank", false);
        AuthCookies.start(() -> { if (!isFinishing()) { if (blankTest) web.loadUrl("about:blank"); else if (state == null || web.restoreState(state) == null) web.loadUrl(BuildConfig.SITE_ORIGIN); } });
    }

    @Override public void onSaveInstanceState(Bundle state) { web.saveState(state); super.onSaveInstanceState(state); }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
    @Override protected void onPause() { AuthCookies.persist(); super.onPause(); }
    @Override protected void onDestroy() { web.destroy(); super.onDestroy(); }
}
