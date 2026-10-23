package com.roxstock.app;

import android.app.*;
import android.content.*;
import android.os.Build;

/** Local display only; the durable inbox and receipt tombstones remain authoritative. */
final class BrokerAlerts {
    static final String CHANNEL="roxstock-trades";
    static void initialize(Context c) {
        if(Build.VERSION.SDK_INT>=26)((NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE))
            .createNotificationChannel(new NotificationChannel(CHANNEL,"RoxStock 거래 알림",NotificationManager.IMPORTANCE_HIGH));
    }
    static boolean granted(Context c) {
        initialize(c);
        NotificationManager m=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
        if(!m.areNotificationsEnabled() || Build.VERSION.SDK_INT>=33&&c.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED)return false;
        return Build.VERSION.SDK_INT<26||m.getNotificationChannel(CHANNEL).getImportance()!=NotificationManager.IMPORTANCE_NONE;
    }
    @android.annotation.SuppressLint("MissingPermission")
    static synchronized void display(Context c,String id,String owner) {
        if(!owner.equals(AppPush.preferences(c).getString("inboxOwner",""))||!AppPush.preferences(c).getBoolean("tradeEnabled",false)||!granted(c))return;
        Intent launch=new Intent(c,MainActivity.class).putExtra("brokerId",id).putExtra("brokerOwner",owner)
            .setData(android.net.Uri.parse("roxstock://broker/"+id)).setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent click=PendingIntent.getActivity(c,0,launch,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b=Build.VERSION.SDK_INT>=26?new Notification.Builder(c,CHANNEL):new Notification.Builder(c);
        Notification n=b.setSmallIcon(com.roxstock.app.R.drawable.ic_roxstock_notification).setContentTitle("RoxStock 거래 알림")
            .setContentText("새 거래 알림을 확인하세요.").setContentIntent(click).setAutoCancel(true).setPriority(Notification.PRIORITY_HIGH).build();
        ((NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE)).notify("broker:"+id,0,n);
    }
    static synchronized void preferences(Context c,String owner,boolean trade,boolean target,boolean news) {
        if(!owner.matches("[1-9][0-9]{0,19}"))throw new IllegalArgumentException();
        String previous=AppPush.preferences(c).getString("inboxOwner", "");
        if(!previous.isEmpty()&&!owner.equals(previous))AppPush.unbind(c);
        if(!owner.equals(AppPush.preferences(c).getString("brokerClickOwner", "")))AppPush.preferences(c).edit().remove("brokerClick").remove("brokerClickOwner").commit();
        if(!trade)cancelAll(c);
        AppPush.preferences(c).edit().putString("inboxOwner",owner).putBoolean("tradeEnabled",trade).putBoolean("targetEnabled",target).putBoolean("newsEnabled",news).commit();
    }
    static void cancelAll(Context c) {
        NotificationManager m=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
        for(android.service.notification.StatusBarNotification n:m.getActiveNotifications())if(n.getTag()!=null&&n.getTag().startsWith("broker:"))m.cancel(n.getTag(),n.getId());
    }
    static void cancel(Context c,String id) {((NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE)).cancel("broker:"+id,0);}
    static void rememberClick(Context c,Intent intent) {
        if(intent==null)return;
        String id=intent.getStringExtra("brokerId"),owner=intent.getStringExtra("brokerOwner");
        if(id==null||!id.matches("[a-f0-9]{64}")||owner==null||!owner.equals(AppPush.preferences(c).getString("inboxOwner","")))return;
        AppPush.preferences(c).edit().putString("brokerClick",id).putString("brokerClickOwner",owner).commit();
    }
    static String pendingClick(Context c,String owner) {
        return !owner.isEmpty()&&owner.equals(AppPush.preferences(c).getString("brokerClickOwner",""))?AppPush.preferences(c).getString("brokerClick",""):"";
    }
}
