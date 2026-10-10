package com.roxstock.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.Toast;

/** Web-only build: no notification service, database, native message bridge or badge. */
public final class MainActivity extends Activity {
    private WebView web;

    private boolean trusted(Uri uri) {
        Uri origin = Uri.parse(BuildConfig.SITE_ORIGIN);
        return "https".equals(uri.getScheme()) && origin.getHost().equals(uri.getHost())
            && origin.getPort() == uri.getPort() && uri.getUserInfo() == null;
    }

    private void openBrowser(Uri uri) {
        if (!"https".equals(uri.getScheme())) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
        catch (ActivityNotFoundException error) { Toast.makeText(this, "링크를 열 브라우저가 없습니다.", Toast.LENGTH_SHORT).show(); }
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout root = new LinearLayout(this);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        web = new WebView(this);
        root.addView(web, new LinearLayout.LayoutParams(-1, -1));
        setContentView(root);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.getSettings().setUserAgentString(web.getSettings().getUserAgentString() + " RoxStockWebOnly/0.1.2");
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
        if (state == null || web.restoreState(state) == null) web.loadUrl(BuildConfig.SITE_ORIGIN);
    }

    @Override public void onSaveInstanceState(Bundle state) { web.saveState(state); super.onSaveInstanceState(state); }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
    @Override protected void onDestroy() { web.destroy(); super.onDestroy(); }
}
