package com.roxstock.app;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;
import org.json.JSONObject;

/** Separate from the broker notification listener. Never reads account/trade information. */
public final class AppPush {
    static final String CHANNEL="roxstock-app-events";
    static android.content.SharedPreferences preferences(Context c){return c.getSharedPreferences("app-push",Context.MODE_PRIVATE);}
    static synchronized String installation(Context c){String id=preferences(c).getString("installation",null);if(id==null){id=java.util.UUID.randomUUID().toString();preferences(c).edit().putString("installation",id).commit();}return id;}
    static boolean configured(){return !BuildConfig.FCM_APP_ID.isEmpty()&&!BuildConfig.FCM_API_KEY.isEmpty()&&!BuildConfig.FCM_PROJECT_ID.isEmpty()&&!BuildConfig.FCM_SENDER_ID.isEmpty();}
    static synchronized void initialize(Context c){
        if(!configured())return;
        if(FirebaseApp.getApps(c).isEmpty())FirebaseApp.initializeApp(c,new FirebaseOptions.Builder().setApplicationId(BuildConfig.FCM_APP_ID).setApiKey(BuildConfig.FCM_API_KEY).setProjectId(BuildConfig.FCM_PROJECT_ID).setGcmSenderId(BuildConfig.FCM_SENDER_ID).build());
        NotificationManager m=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
        if(Build.VERSION.SDK_INT>=26)m.createNotificationChannel(new NotificationChannel(CHANNEL,"RoxStock 앱 알림",NotificationManager.IMPORTANCE_DEFAULT));
    }
    static boolean granted(Context c){NotificationManager m=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);if(!m.areNotificationsEnabled())return false;if(Build.VERSION.SDK_INT>=26){NotificationChannel channel=m.getNotificationChannel(CHANNEL);if(channel!=null&&channel.getImportance()==NotificationManager.IMPORTANCE_NONE)return false;}return Build.VERSION.SDK_INT<33||c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED;}
    static String tokenHash(String token){try{byte[] digest=java.security.MessageDigest.getInstance("SHA-256").digest(token.getBytes(java.nio.charset.StandardCharsets.UTF_8));StringBuilder result=new StringBuilder();for(byte b:digest)result.append(String.format(java.util.Locale.ROOT,"%02x",b&255));return result.toString();}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
    static synchronized void tokenChanged(Context c,String token){if(!preferences(c).getString("binding","").isEmpty()&&!tokenHash(token).equals(preferences(c).getString("boundTokenHash","")))unbind(c);}
    static void unbind(Context c){synchronized(BrokerAlerts.class){preferences(c).edit().remove("brokerClick").remove("brokerClickOwner").remove("inboxOwner").putBoolean("tradeEnabled",false).remove("binding").remove("boundTokenHash").putBoolean("targetEnabled",false).putBoolean("newsEnabled",false).putLong("revision",preferences(c).getLong("revision",0)+1).commit();((NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE)).cancelAll();}}
    static String launchPath(Intent intent){String id=intent==null?null:intent.getStringExtra("pushEvent");return id!=null&&id.matches("[a-f0-9-]{36}")?"/?pushEvent="+id:"/";}
    static void settings(Activity a){Intent intent=new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);intent.putExtra(Settings.EXTRA_APP_PACKAGE,a.getPackageName());a.startActivity(intent);}
    @android.annotation.SuppressLint("MissingPermission") // granted() checks both runtime and channel permissions.
    static synchronized void display(Context c,java.util.Map<String,String> data){
        String binding=data.get("binding"),id=data.get("eventId"),kind=data.get("kind");
        if(binding==null||!binding.equals(preferences(c).getString("binding",""))||id==null||!id.matches("[a-f0-9-]{36}")||!("TARGET".equals(kind)||"NEWS".equals(kind))||!granted(c))return;
        if(!preferences(c).getBoolean("TARGET".equals(kind)?"targetEnabled":"newsEnabled",false))return;
        long expires;try{expires=Long.parseLong(data.get("expiresAt"));}catch(Exception e){return;}long now=System.currentTimeMillis();if(expires<now||expires>now+660000)return;
        // Commit before display. Retries of an uncertain server send do not display twice.
        android.content.SharedPreferences p=preferences(c);if(p.contains("seen:"+id))return;
        android.content.SharedPreferences.Editor edit=p.edit();for(java.util.Map.Entry<String,?> e:p.getAll().entrySet())if(e.getKey().startsWith("seen:")&&e.getValue() instanceof Long&&(Long)e.getValue()<now)edit.remove(e.getKey());edit.putLong("seen:"+id,expires).commit();
        Intent launch=new Intent(c,MainActivity.class).putExtra("pushEvent",id).setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent click=PendingIntent.getActivity(c,id.hashCode(),launch,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b=Build.VERSION.SDK_INT>=26?new Notification.Builder(c,CHANNEL):new Notification.Builder(c);
        Notification n=b.setSmallIcon(R.drawable.ic_roxstock_notification).setContentTitle("RoxStock").setContentText("TARGET".equals(kind)?"새 목표가 도래 항목을 확인하세요.":"새 종목소식을 확인하세요.").setContentIntent(click).setAutoCancel(true).build();
        ((NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE)).notify(id.hashCode(),n);
    }
}
