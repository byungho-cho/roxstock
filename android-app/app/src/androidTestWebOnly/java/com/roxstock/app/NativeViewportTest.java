package com.roxstock.app;

import static org.junit.Assert.*;
import android.graphics.Insets;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

@android.annotation.TargetApi(30)
@RunWith(AndroidJUnit4.class)
public class NativeViewportTest {
    @Test public void rootOwnsSystemInsetsExactlyOnceAndConsumesThemForWebView() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            scenario.onActivity(activity -> {
                ViewGroup content = activity.findViewById(android.R.id.content);
                ViewGroup root = (ViewGroup) content.getChildAt(0);
                WebView web = (WebView) root.getChildAt(0);
                web.stopLoading();
                assertEquals("Native root must fill the window before applying system padding",
                    activity.getWindow().getDecorView().getHeight(), root.getHeight());
                WindowInsets bars = new WindowInsets.Builder()
                    .setInsets(WindowInsets.Type.systemBars(), Insets.of(0, 24, 0, 80)).build();
                WindowInsets remaining = root.dispatchApplyWindowInsets(bars);
                assertEquals(24, root.getPaddingTop());
                assertEquals(80, root.getPaddingBottom());
                assertTrue("WebView must not apply the same system inset again", remaining.isConsumed());
                root.dispatchApplyWindowInsets(new WindowInsets.Builder(bars)
                    .setInsets(WindowInsets.Type.ime(), Insets.of(0, 0, 0, 280)).build());
                assertEquals("Keyboard and navigation insets overlap, they are not added", 280, root.getPaddingBottom());
                root.dispatchApplyWindowInsets(bars);
                assertEquals("Closing keyboard restores only the navigation inset", 80, root.getPaddingBottom());
                WindowInsets landscape = new WindowInsets.Builder()
                    .setInsets(WindowInsets.Type.systemBars(), Insets.of(0, 24, 48, 0)).build();
                root.dispatchApplyWindowInsets(landscape);
                assertEquals(48, root.getPaddingRight());
                assertEquals(0, root.getPaddingBottom());
                root.requestApplyInsets();
            });
        }
    }
    @Test public void webFooterEndsAtWebViewViewportWithoutSecondSafeArea() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            java.util.concurrent.CountDownLatch loaded = new java.util.concurrent.CountDownLatch(1);
            java.util.concurrent.atomic.AtomicReference<WebView> web = new java.util.concurrent.atomic.AtomicReference<>();
            scenario.onActivity(activity -> {
                ViewGroup content = activity.findViewById(android.R.id.content);
                WebView view = (WebView) ((ViewGroup) content.getChildAt(0)).getChildAt(0);
                web.set(view); view.stopLoading();
                view.setWebViewClient(new android.webkit.WebViewClient() {
                    @Override public void onPageFinished(WebView v, String url) { loaded.countDown(); }
                });
                view.loadDataWithBaseURL(BuildConfig.SITE_ORIGIN,
                    "<html><head><meta name='viewport' content='width=device-width, initial-scale=1'></head>"
                    + "<body style='margin:0'><div style='height:100dvh;display:flex;flex-direction:column'>"
                    + "<header style='height:44px;flex-shrink:0'>Menu</header><main style='flex:1;min-height:0;overflow:auto'>Body</main>"
                    + "<nav style='box-sizing:border-box;height:calc(44px + env(safe-area-inset-bottom,0px));padding-bottom:env(safe-area-inset-bottom,0px);flex-shrink:0'>Bottom</nav></div></body></html>",
                    "text/html", "UTF-8", null);
            });
            assertTrue(loaded.await(20, java.util.concurrent.TimeUnit.SECONDS));
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            java.util.concurrent.CountDownLatch measured = new java.util.concurrent.CountDownLatch(1);
            java.util.concurrent.atomic.AtomicReference<String> result = new java.util.concurrent.atomic.AtomicReference<>();
            scenario.onActivity(activity -> web.get().evaluateJavascript(
                "(()=>{const n=document.querySelector('nav');return Math.abs(n.getBoundingClientRect().bottom-innerHeight)<1 && parseFloat(getComputedStyle(n).paddingBottom)===0})()",
                value -> { result.set(value); measured.countDown(); }));
            assertTrue(measured.await(10, java.util.concurrent.TimeUnit.SECONDS));
            assertEquals("Footer must reach usable viewport and native padding must not repeat in CSS", "true", result.get());
        }
    }
}