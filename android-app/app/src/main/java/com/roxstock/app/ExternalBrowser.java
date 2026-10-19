package com.roxstock.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.widget.Toast;
import java.util.function.Consumer;

/** External HTTPS links prefer Chrome; a missing/disabled Chrome uses the default browser. */
final class ExternalBrowser {
    static boolean open(Uri uri, Consumer<Intent> launch) {
        if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null) return false;
        try {
            launch.accept(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE).setPackage("com.android.chrome"));
            return true;
        } catch (ActivityNotFoundException | SecurityException unavailable) {
            try {
                launch.accept(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE));
                return true;
            } catch (ActivityNotFoundException | SecurityException noBrowser) { return false; }
        }
    }
    static void open(Activity activity, Uri uri) {
        if (!open(uri, activity::startActivity)) Toast.makeText(activity, "원문 링크를 열 브라우저가 없습니다. 브라우저 설치·사용 설정을 확인해 주세요.", Toast.LENGTH_LONG).show();
    }
    private ExternalBrowser() { }
}
