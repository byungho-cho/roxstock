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
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        AppPush.initialize(this);
        BrokerAlerts.initialize(this);BrokerAlerts.rememberClick(this,getIntent());
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL);
        AppWindowInsets.install(this, root);
        web = new WebView(this); root.addView(web, new LinearLayout.LayoutParams(-1, 0, 1)); setContentView(root);
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
                        case "push-status": response.put("tradeGranted",BrokerAlerts.granted(this)).put("granted",AppPush.granted(this)).put("configured",AppPush.configured());break;
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
                        case "unbind": boolean keepClick="true".equals(command.optString("preserveBrokerClick"));String clickId=AppPush.preferences(this).getString("brokerClick", ""),clickOwner=AppPush.preferences(this).getString("brokerClickOwner", "");AppPush.unbind(this);if(keepClick&&!clickId.isEmpty())AppPush.preferences(this).edit().putString("brokerClick",clickId).putString("brokerClickOwner",clickOwner).commit();break;
                        case "preferences": BrokerAlerts.preferences(this,command.optString("userId"),"true".equals(command.optString("tradeEnabled")),"true".equals(command.optString("targetEnabled")),"true".equals(command.optString("newsEnabled")));break;
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
                        case "list": if(command.has("userId")&&!command.optString("userId").equals(AppPush.preferences(this).getString("inboxOwner","")))throw new IllegalArgumentException();response.put("openInbox",BrokerAlerts.pendingClick(this,AppPush.preferences(this).getString("inboxOwner",""))).put("protocolVersion",2).put("entries", db.list(AppPush.preferences(this).getString("inboxOwner",""))).put("total",db.count(AppPush.preferences(this).getString("inboxOwner",""))).put("permission", enabled()).put("storageError", getSharedPreferences("status", MODE_PRIVATE).getBoolean("storageError", false)); break;
                        case "ack-click": if(command.optString("id").equals(BrokerAlerts.pendingClick(this,AppPush.preferences(this).getString("inboxOwner",""))))AppPush.preferences(this).edit().remove("brokerClick").remove("brokerClickOwner").commit();break;
                        case "status": db.status(command.getString("id"), command.getString("status"),AppPush.preferences(this).getString("inboxOwner","")); break;
                        case "push-status": response.put("tradeGranted",BrokerAlerts.granted(this)).put("granted",AppPush.granted(this)).put("configured",AppPush.configured());break;
                        case "permission": startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)); break;
                        default: throw new IllegalArgumentException("Unsupported command");
                    }
                } catch (Exception error) { try { response.put("error", "알림 처리에 실패했습니다. 다시 시도해 주세요."); } catch (Exception ignored) {} }
                reply.postMessage(response.toString());
            });
        } else new AlertDialog.Builder(this).setMessage("알림 기능을 사용하려면 Android System WebView 또는 Chrome을 업데이트해 주세요.").setPositiveButton("확인", null).show();
        AuthCookies.start(() -> { if (!isFinishing()) web.loadUrl(BuildConfig.SITE_ORIGIN + AppPush.launchPath(getIntent())); });
    }
    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] results){super.onRequestPermissionsResult(requestCode,permissions,results);if(requestCode==701&&permissionReply!=null){try{permissionResponse.put("granted",AppPush.granted(this));permissionReply.postMessage(permissionResponse.toString());}catch(Exception ignored){}permissionReply=null;permissionResponse=null;}}
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);BrokerAlerts.rememberClick(this,intent);if(web!=null)web.loadUrl(BuildConfig.SITE_ORIGIN+AppPush.launchPath(intent));}
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
    @Override protected void onResume() { super.onResume(); if (updateBadge != null) handler.post(updateBadge); }
    @Override protected void onPause() { AuthCookies.persist(); handler.removeCallbacksAndMessages(null); super.onPause(); }
    @Override protected void onDestroy() { handler.removeCallbacksAndMessages(null); web.destroy(); super.onDestroy(); }
}
