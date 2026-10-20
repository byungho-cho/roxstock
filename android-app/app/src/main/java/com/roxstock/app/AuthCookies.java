package com.roxstock.app;

import android.webkit.CookieManager;

/** Session-only cookies end on a fresh app process; persistent cookies keep their server expiry. */
final class AuthCookies {
    private static boolean initialized;
    static void start(Runnable load) {
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        if (initialized) { load.run(); return; }
        initialized = true;
        cookies.removeSessionCookies(removed -> load.run());
    }
    static void persist() { CookieManager.getInstance().flush(); }
    private AuthCookies() {}
}
