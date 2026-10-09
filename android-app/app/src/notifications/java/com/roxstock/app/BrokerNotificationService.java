package com.roxstock.app;

import android.app.Notification;
import android.os.Bundle;
import android.os.Parcelable;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import java.util.LinkedHashSet;
import java.util.Set;

public final class BrokerNotificationService extends NotificationListenerService {
    @Override public void onNotificationPosted(StatusBarNotification event) {
        if (!"com.kakao.talk".equals(event.getPackageName())) return;
        Notification notification = event.getNotification();
        if ((notification.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
        Bundle extras = notification.extras;
        if (extras == null) return;
        Set<String> candidates = new LinkedHashSet<>();
        Parcelable[] messages = extras.getParcelableArray(Notification.EXTRA_MESSAGES);
        // A conversation notification can include previous messages; process only its newest message.
        if (messages != null && messages.length > 0 && messages[messages.length - 1] instanceof Bundle) {
            CharSequence text = ((Bundle) messages[messages.length - 1]).getCharSequence("text");
            if (text != null) candidates.add(text.toString());
        } else {
            CharSequence big = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
            CharSequence text = big != null ? big : extras.getCharSequence(Notification.EXTRA_TEXT);
            if (text != null) candidates.add(text.toString());
        }
        long receivedAt = System.currentTimeMillis();
        try (InboxDb db = new InboxDb(this)) {
            for (String raw : candidates) db.receive(raw, receivedAt);
        } catch (Exception ignored) {
            // Never log notification text, account numbers or personal conversations.
            getSharedPreferences("status", MODE_PRIVATE).edit().putBoolean("storageError", true).apply();
        }
    }
}
