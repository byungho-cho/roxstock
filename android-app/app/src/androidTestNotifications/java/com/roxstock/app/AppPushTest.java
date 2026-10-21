package com.roxstock.app;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.ParcelFileDescriptor;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
@RunWith(AndroidJUnit4.class)
public final class AppPushTest {
 private void shell(String command)throws Exception{try(ParcelFileDescriptor p=InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand(command);java.io.InputStream in=new ParcelFileDescriptor.AutoCloseInputStream(p)){byte[] buffer=new byte[512];while(in.read(buffer)!=-1){}}}
 @Test public void permissionBindingDedupLogoutAndColdDestination()throws Exception{
  Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();String pkg=c.getPackageName();
  NotificationManager m=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);m.createNotificationChannel(new android.app.NotificationChannel(AppPush.CHANNEL,"fixture",3));
  shell("pm grant "+pkg+" android.permission.POST_NOTIFICATIONS");assertTrue(AppPush.granted(c));
  String id=java.util.UUID.randomUUID().toString();java.util.Map<String,String> data=new java.util.HashMap<>();data.put("eventId",id);data.put("kind","NEWS");data.put("binding","fixture-binding");data.put("expiresAt",String.valueOf(System.currentTimeMillis()+600000));
  AppPush.unbind(c);AppPush.display(c,data);assertEquals(0,m.getActiveNotifications().length);
  AppPush.preferences(c).edit().putString("binding","fixture-binding").putBoolean("newsEnabled",true).commit();AppPush.display(c,data);android.os.SystemClock.sleep(300);assertEquals(1,m.getActiveNotifications().length);m.cancelAll();AppPush.display(c,data);assertEquals(0,m.getActiveNotifications().length);
  assertEquals("/?pushEvent="+id,AppPush.launchPath(new Intent().putExtra("pushEvent",id)));assertEquals("/",AppPush.launchPath(new Intent().putExtra("pushEvent","https://evil.invalid")));
  AppPush.unbind(c);data.put("eventId",java.util.UUID.randomUUID().toString());AppPush.display(c,data);assertEquals(0,m.getActiveNotifications().length);
  shell("pm revoke "+pkg+" android.permission.POST_NOTIFICATIONS");assertFalse(AppPush.granted(c));
 }
}
