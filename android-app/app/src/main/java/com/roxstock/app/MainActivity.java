package com.roxstock.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.Button;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONObject;
import java.util.Collections;

public final class MainActivity extends Activity {
    private WebView web;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable updateBadge;
    private boolean trusted(Uri uri) {
        Uri origin = Uri.parse(BuildConfig.SITE_ORIGIN);
        return "https".equals(uri.getScheme()) && origin.getHost().equals(uri.getHost()) && origin.getPort() == uri.getPort() && uri.getUserInfo() == null;
    }
    private boolean enabled() {
        String listeners = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
        String component = new ComponentName(this, BrokerNotificationService.class).flattenToString();
        if (listeners != null) for (String value : listeners.split(":")) if (component.equals(value)) return true;
        return false;
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL);
        root.setOnApplyWindowInsetsListener((view, insets) -> { view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom()); return insets; });
        Button inbox = new Button(this); inbox.setText("거래 알림 · 등록 대기");
        root.addView(inbox, new LinearLayout.LayoutParams(-1, -2));
        web = new WebView(this); root.addView(web, new LinearLayout.LayoutParams(-1, 0, 1)); setContentView(root);
        updateBadge = () -> {
            try (InboxDb db = new InboxDb(this)) {
                org.json.JSONArray rows = db.list(); int count = 0;
                for (int i = 0; i < rows.length(); i++) if ("pending".equals(rows.getJSONObject(i).getString("status"))) count++;
                inbox.setText("거래 알림 · 등록 대기 " + count + "건");
            } catch (Exception ignored) { inbox.setText("거래 알림 · 보관함 확인 필요"); }
            handler.postDelayed(updateBadge, 3000);
        };
        web.getSettings().setJavaScriptEnabled(true); web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false); web.getSettings().setAllowContentAccess(false);
        web.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (trusted(request.getUrl())) return false;
                if (request.isForMainFrame() && "https".equals(request.getUrl().getScheme())) startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl()));
                return true;
            }
        });
        web.setDownloadListener((url, userAgent, disposition, mime, size) -> {
            Uri uri = Uri.parse(url); if (trusted(uri)) startActivity(new Intent(Intent.ACTION_VIEW, uri));
        });
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "RoxStockNative", Collections.singleton(BuildConfig.SITE_ORIGIN), (view, message, origin, mainFrame, reply) -> {
                if (!mainFrame || !trusted(origin)) return;
                JSONObject response = new JSONObject();
                try (InboxDb db = new InboxDb(this)) {
                    JSONObject command = new JSONObject(message.getData());
                    response.put("requestId", command.optString("requestId"));
                    switch (command.getString("action")) {
                        case "list": response.put("entries", db.list()).put("permission", enabled()).put("storageError", getSharedPreferences("status", MODE_PRIVATE).getBoolean("storageError", false)); break;
                        case "status": db.status(command.getString("id"), command.getString("status")); break;
                        case "permission": startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)); break;
                        default: throw new IllegalArgumentException("Unsupported command");
                    }
                } catch (Exception error) { try { response.put("error", "알림 처리에 실패했습니다. 다시 시도해 주세요."); } catch (Exception ignored) {} }
                reply.postMessage(response.toString());
            });
        } else new AlertDialog.Builder(this).setMessage("알림 기능을 사용하려면 Android System WebView 또는 Chrome을 업데이트해 주세요.").setPositiveButton("확인", null).show();
        inbox.setOnClickListener(v -> new AlertDialog.Builder(this).setMessage("작성 중인 화면을 나가 거래 알림 목록을 여시겠습니까? 저장하지 않은 입력은 다시 입력해야 할 수 있습니다.").setNegativeButton("취소", null).setPositiveButton("목록 열기", (dialog, which) -> web.loadUrl(BuildConfig.SITE_ORIGIN + "/detail/notifications")).show());
        web.loadUrl(BuildConfig.SITE_ORIGIN);
    }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
    @Override protected void onResume() { super.onResume(); if (updateBadge != null) handler.post(updateBadge); }
    @Override protected void onPause() { handler.removeCallbacksAndMessages(null); super.onPause(); }
    @Override protected void onDestroy() { handler.removeCallbacksAndMessages(null); web.destroy(); super.onDestroy(); }
}
