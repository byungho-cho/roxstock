package com.roxstock.app;

import static org.junit.Assert.*;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class WebOnlySmokeTest {
    private WebView findWeb(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) view).getChildCount(); i++) {
            WebView found = findWeb(((ViewGroup) view).getChildAt(i)); if (found != null) return found;
        }
        return null;
    }
    @Test public void installedPackageLoadsWebMenuAndBackWithoutNotificationComponents() throws Exception {
        android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), PackageManager.GET_PERMISSIONS | PackageManager.GET_SERVICES | PackageManager.GET_RECEIVERS);
        assertEquals("com.roxstock.app.webonly.debug", info.packageName);
        assertArrayEquals(new String[]{"android.permission.INTERNET"}, info.requestedPermissions);
        assertTrue(info.services == null || info.services.length == 0);
        assertTrue(info.receivers == null || info.receivers.length == 0);
        for (String name : Arrays.asList("com.roxstock.app.BrokerNotificationService", "com.roxstock.app.InboxDb")) {
            try { Class.forName(name, false, context.getClassLoader()); fail("Collector class packaged: " + name); }
            catch (ClassNotFoundException expected) { }
        }
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AtomicReference<WebView> web = new AtomicReference<>();
            AtomicReference<CountDownLatch> loaded = new AtomicReference<>(new CountDownLatch(1));
            scenario.onActivity(activity -> {
                WebView view = findWeb(activity.getWindow().getDecorView()); web.set(view);
                assertNotNull(view);
                assertTrue(view.getSettings().getUserAgentString().contains("RoxStockWebOnly/"));
                view.stopLoading();
                // In-process site fixture: no production data or network dependency.
                view.setWebViewClient(new WebViewClient() {
                    @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest request) {
                        String html = "<html><head><title>RoxStock fixture</title></head><body><a id='menu' href='/test-menu'>menu</a></body></html>";
                        return new WebResourceResponse("text/html", "UTF-8", new ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8)));
                    }
                    @Override public void onPageFinished(WebView v, String url) { if (url.contains("/test-")) loaded.get().countDown(); }
                });
                view.loadUrl(BuildConfig.SITE_ORIGIN + "/test-home");
            });
            assertTrue("Fixture failed to load", loaded.get().await(20, TimeUnit.SECONDS));
            CountDownLatch bridge = new CountDownLatch(1);
            scenario.onActivity(activity -> {
                assertEquals("RoxStock fixture", web.get().getTitle());
                web.get().evaluateJavascript("typeof window.RoxStockNative", result -> { assertEquals("\"undefined\"", result); bridge.countDown(); });
            });
            assertTrue(bridge.await(5, TimeUnit.SECONDS));
            loaded.set(new CountDownLatch(1));
            scenario.onActivity(activity -> web.get().evaluateJavascript("document.getElementById('menu').click()", null));
            assertTrue("Menu navigation failed", loaded.get().await(20, TimeUnit.SECONDS));
            scenario.onActivity(activity -> { assertTrue(web.get().getUrl().endsWith("/test-menu")); assertTrue(web.get().canGoBack()); });
            loaded.set(new CountDownLatch(1));
            scenario.onActivity(MainActivity::onBackPressed);
            assertTrue("Back navigation failed", loaded.get().await(20, TimeUnit.SECONDS));
            scenario.onActivity(activity -> assertTrue(web.get().getUrl().endsWith("/test-home")));
        }
    }
}
