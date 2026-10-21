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
    private androidx.webkit.JavaScriptReplyProxy permissionReply;
    private JSONObject permissionResponse;
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
    private void showInbox() {
        try (InboxDb db = new InboxDb(this)) {
            org.json.JSONArray rows = db.list();
            java.util.List<String> labels = new java.util.ArrayList<>();
            java.util.List<JSONObject> pending = new java.util.ArrayList<>();
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.getJSONObject(i);
                if (!"pending".equals(row.getString("status"))) continue;
                pending.add(row);
                String raw = row.getString("raw");
                labels.add(raw.substring(0, Math.min(100, raw.length())).replace('\n', ' '));
            }
            if (pending.isEmpty()) { new AlertDialog.Builder(this).setMessage("대기 알림이 없습니다. 알림 접근을 허용한 이후 새로 수신한 전량체결·배당 알림을 확인하세요.").setPositiveButton("확인", null).show(); return; }
            new AlertDialog.Builder(this).setTitle("등록 대기 " + pending.size() + "건").setItems(labels.toArray(new String[0]), (dialog, index) -> {
                JSONObject entry = pending.get(index);
                new AlertDialog.Builder(this).setTitle("수신 내용 확인").setMessage(entry.optString("raw"))
                    .setNegativeButton("닫기", null).setPositiveButton("등록 화면", (detail, which) -> web.loadUrl(BuildConfig.SITE_ORIGIN + "/detail/notifications?notice=" + entry.optString("id"))).show();
            }).setNegativeButton("닫기", null).show();
        } catch (Exception error) { new AlertDialog.Builder(this).setMessage("알림 보관함을 열지 못했습니다.").setPositiveButton("확인", null).show(); }
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        AppPush.initialize(this);
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL);
        AppWindowInsets.install(this, root);
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
        web.getSettings().setUserAgentString(web.getSettings().getUserAgentString() + " RoxStockApp/" + BuildConfig.VERSION_NAME);
        web.getSettings().setAllowFileAccess(false); web.getSettings().setAllowContentAccess(false);
        web.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (trusted(request.getUrl())) return false;
                if (request.isForMainFrame() && "https".equals(request.getUrl().getScheme())) ExternalBrowser.open(MainActivity.this, request.getUrl());
                return true;
            }
        });
        web.setDownloadListener((url, userAgent, disposition, mime, size) -> {
            Uri uri = Uri.parse(url); if (trusted(uri)) ExternalBrowser.open(MainActivity.this, uri);
        });
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "RoxStockPush", Collections.singleton(BuildConfig.SITE_ORIGIN), (view, message, origin, mainFrame, reply) -> {
                if (!mainFrame || !trusted(origin)) return;
                JSONObject response = new JSONObject();
                try {
                    JSONObject command = new JSONObject(message.getData());response.put("requestId", command.optString("requestId"));
                    switch(command.getString("action")) {
                        case "push-status": response.put("granted",AppPush.granted(this)).put("configured",AppPush.configured());break;
                        case "permission":
                            if(android.os.Build.VERSION.SDK_INT>=33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED){permissionReply=reply;permissionResponse=response;requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS},701);return;}
                            response.put("granted",AppPush.granted(this));break;
                        case "token":
                            response.put("granted",AppPush.granted(this)).put("configured",AppPush.configured()).put("installationId",AppPush.installation(this)).put("revision",String.valueOf(AppPush.preferences(this).getLong("revision",0)));
                            if(AppPush.configured()&&AppPush.granted(this)){
                                com.google.firebase.messaging.FirebaseMessaging.getInstance().setAutoInitEnabled(true);
                                com.google.firebase.messaging.FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task->{try{if(task.isSuccessful()){AppPush.preferences(this).edit().putString("issuedTokenHash",AppPush.tokenHash(task.getResult())).commit();response.put("token",task.getResult());}else response.put("error","푸시 기기 등록에 실패했습니다.");}catch(Exception ignored){}reply.postMessage(response.toString());});return;
                            }break;
                        case "bind": if(!command.optString("revision").equals(String.valueOf(AppPush.preferences(this).getLong("revision",0))))throw new IllegalArgumentException();String binding=command.getString("binding");if(!binding.matches("[a-f0-9-]{36}"))throw new IllegalArgumentException();AppPush.preferences(this).edit().putString("binding",binding).putString("boundTokenHash",AppPush.preferences(this).getString("issuedTokenHash","")).commit();break;
                        case "unbind": AppPush.unbind(this);break;
                        case "preferences": AppPush.preferences(this).edit().putBoolean("targetEnabled","true".equals(command.optString("targetEnabled"))).putBoolean("newsEnabled","true".equals(command.optString("newsEnabled"))).commit();break;
                        case "settings": AppPush.settings(this);break;
                        default: throw new IllegalArgumentException();
                    }
                }catch(Exception error){try{response.put("error","앱 알림 처리에 실패했습니다.");}catch(Exception ignored){}}
                reply.postMessage(response.toString());
            });
            WebViewCompat.addWebMessageListener(web, "RoxStockNative", Collections.singleton(BuildConfig.SITE_ORIGIN), (view, message, origin, mainFrame, reply) -> {
                if (!mainFrame || !trusted(origin)) return;
                JSONObject response = new JSONObject();
                try (InboxDb db = new InboxDb(this)) {
                    JSONObject command = new JSONObject(message.getData());
                    response.put("requestId", command.optString("requestId"));
                    switch (command.getString("action")) {
                        case "list": response.put("entries", db.list()).put("permission", enabled()).put("storageError", getSharedPreferences("status", MODE_PRIVATE).getBoolean("storageError", false)); break;
                        case "status": db.status(command.getString("id"), command.getString("status")); break;
                        case "push-status": response.put("granted",AppPush.granted(this)).put("configured",AppPush.configured());break;
                        case "permission": startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)); break;
                        default: throw new IllegalArgumentException("Unsupported command");
                    }
                } catch (Exception error) { try { response.put("error", "알림 처리에 실패했습니다. 다시 시도해 주세요."); } catch (Exception ignored) {} }
                reply.postMessage(response.toString());
            });
        } else new AlertDialog.Builder(this).setMessage("알림 기능을 사용하려면 Android System WebView 또는 Chrome을 업데이트해 주세요.").setPositiveButton("확인", null).show();
        inbox.setOnClickListener(v -> new AlertDialog.Builder(this).setTitle("거래 알림")
            .setItems(new String[]{"휴대폰에 수신한 대기 알림 확인", "알림 접근 허용·설정", "웹 등록 대기 목록"}, (dialog, index) -> {
                if (index == 0) showInbox();
                else if (index == 1) startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));
                else new AlertDialog.Builder(this).setMessage("작성 중인 화면을 나가시겠습니까? 저장하지 않은 입력은 다시 입력해야 할 수 있습니다.").setNegativeButton("취소", null).setPositiveButton("목록 열기", (confirm, which) -> web.loadUrl(BuildConfig.SITE_ORIGIN + "/detail/notifications")).show();
            }).setNegativeButton("닫기", null).show());
        AuthCookies.start(() -> { if (!isFinishing()) web.loadUrl(BuildConfig.SITE_ORIGIN + AppPush.launchPath(getIntent())); });
    }
    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] results){super.onRequestPermissionsResult(requestCode,permissions,results);if(requestCode==701&&permissionReply!=null){try{permissionResponse.put("granted",AppPush.granted(this));permissionReply.postMessage(permissionResponse.toString());}catch(Exception ignored){}permissionReply=null;permissionResponse=null;}}
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);if(web!=null)web.loadUrl(BuildConfig.SITE_ORIGIN+AppPush.launchPath(intent));}
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
    @Override protected void onResume() { super.onResume(); if (updateBadge != null) handler.post(updateBadge); }
    @Override protected void onPause() { AuthCookies.persist(); handler.removeCallbacksAndMessages(null); super.onPause(); }
    @Override protected void onDestroy() { handler.removeCallbacksAndMessages(null); web.destroy(); super.onDestroy(); }
}
