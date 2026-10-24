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
 private void policy(Context c,boolean enabled)throws Exception{AccountAlerts.save(c,"[{\"id\":\"1\",\"brokerName\":\"미래에셋증권\",\"accountNumber\":\"1234-12-5678\",\"enabled\":"+enabled+",\"buyEnabled\":true,\"sellEnabled\":true,\"dividendEnabled\":true,\"newsEnabled\":true,\"targetEnabled\":true}]");}
 private void shell(String command)throws Exception{try(ParcelFileDescriptor p=InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand(command);java.io.InputStream in=new ParcelFileDescriptor.AutoCloseInputStream(p)){byte[] buffer=new byte[512];while(in.read(buffer)!=-1){}}}
 private void expectCount(NotificationManager manager,int expected){long end=android.os.SystemClock.uptimeMillis()+5000;while(manager.getActiveNotifications().length!=expected&&android.os.SystemClock.uptimeMillis()<end)android.os.SystemClock.sleep(50);assertEquals(expected,manager.getActiveNotifications().length);}
 @Test public void permissionBindingDedupLogoutAndColdDestination()throws Exception{
  Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();String pkg=c.getPackageName();
  NotificationManager m=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);m.createNotificationChannel(new android.app.NotificationChannel(AppPush.CHANNEL,"fixture",3));
  assertFalse(AppPush.granted(c));
  shell("pm grant "+pkg+" android.permission.POST_NOTIFICATIONS");assertTrue(AppPush.granted(c));
  String id=java.util.UUID.randomUUID().toString();java.util.Map<String,String> data=new java.util.HashMap<>();data.put("eventId",id);data.put("kind","NEWS");data.put("accountId","1");data.put("binding","fixture-binding");data.put("expiresAt",String.valueOf(System.currentTimeMillis()+600000));
  AppPush.unbind(c);AppPush.display(c,data);expectCount(m,0);
  policy(c,true);AppPush.preferences(c).edit().putString("binding","fixture-binding").putBoolean("newsEnabled",true).putString("boundTokenHash",AppPush.tokenHash("fixture-token")).commit();AppPush.display(c,data);expectCount(m,1);m.cancelAll();AppPush.display(c,data);expectCount(m,0);
  targetOutOfOrder(c,m);
  assertEquals("/?pushEvent="+id,AppPush.launchPath(new Intent().putExtra("pushEvent",id)));assertEquals("/",AppPush.launchPath(new Intent().putExtra("pushEvent","https://evil.invalid")));
  AppPush.tokenChanged(c,"fixture-token");assertEquals("fixture-binding",AppPush.preferences(c).getString("binding",""));AppPush.tokenChanged(c,"rotated-token");assertEquals("",AppPush.preferences(c).getString("binding",""));
  AppPush.unbind(c);data.put("eventId",java.util.UUID.randomUUID().toString());AppPush.display(c,data);expectCount(m,0);
  c.deleteDatabase("broker-inbox.db");m.cancelAll();
  String raw="[미래에셋증권] 전량체결\n매매구분: 매수\n계좌번호: 1234-12-5678\n주문번호: 456\n종목명: fixture\n체결수량: 1주\n체결단가: 100원";
  policy(c,true);AppPush.preferences(c).edit().putString("inboxOwner","1").putBoolean("tradeEnabled",true).commit();
  String brokerId;
  try(InboxDb db=new InboxDb(c)){
   db.receive(raw,System.currentTimeMillis());brokerId=db.list("1").getJSONObject(0).getString("id");BrokerAlerts.display(c,brokerId,"1");expectCount(m,1);
   assertEquals(com.roxstock.app.R.drawable.ic_roxstock_notification,m.getActiveNotifications()[0].getNotification().getSmallIcon().getResId());
   m.cancelAll();assertEquals(1,db.count("1"));db.receive(raw,System.currentTimeMillis());expectCount(m,0);
   BrokerAlerts.rememberClick(c,new Intent().putExtra("brokerId",brokerId).putExtra("brokerOwner","2"));assertEquals("",BrokerAlerts.pendingClick(c,"1"));
   BrokerAlerts.rememberClick(c,new Intent().putExtra("brokerId",brokerId).putExtra("brokerOwner","1"));assertEquals(brokerId,BrokerAlerts.pendingClick(c,"1"));assertEquals("",BrokerAlerts.pendingClick(c,"2"));
   BrokerAlerts.clearSession(c,true);BrokerAlerts.preferences(c,"1",true,false,false);assertEquals(brokerId,BrokerAlerts.pendingClick(c,"1"));
   BrokerAlerts.preferences(c,"2",true,false,false);assertEquals("",BrokerAlerts.pendingClick(c,"2"));BrokerAlerts.preferences(c,"1",true,false,false);
   policy(c,true);BrokerAlerts.display(c,brokerId,"1");expectCount(m,1);db.status(brokerId,"ignored","2");expectCount(m,1);db.status(brokerId,"completed","1");expectCount(m,0);
   policy(c,false);AppPush.preferences(c).edit().putBoolean("tradeEnabled",false).commit();db.receive(raw+" changed",System.currentTimeMillis());assertEquals(0,db.count("1"));expectCount(m,0);policy(c,true);assertEquals(1,db.count("1"));expectCount(m,0);
  }
  AppPush.unbind(c);assertEquals("",BrokerAlerts.pendingClick(c,"1"));c.deleteDatabase("broker-inbox.db");
  // Revoking a runtime permission terminates this instrumentation process. Denial is checked before the grant above.
 }
 @Test public void brokerOwnerDedupOffAndRestart()throws Exception{
  Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();c.deleteDatabase("broker-inbox.db");
  String raw="[미래에셋증권] 전량체결\n매매구분: 매수\n계좌번호: 1234-12-5678\n주문번호: 123\n종목명: fixture\n체결수량: 1주\n체결단가: 100원";
  policy(c,true);AppPush.preferences(c).edit().putString("inboxOwner","1").putBoolean("tradeEnabled",true).commit();
  try(InboxDb db=new InboxDb(c)){db.receive(raw,System.currentTimeMillis());assertEquals(1,db.count("1"));assertEquals(0,db.count("2"));String id=db.list("1").getJSONObject(0).getString("id");db.status(id,"ignored","2");assertEquals(1,db.count("1"));db.status(id,"ignored","1");assertEquals(0,db.count("1"));}
  try(InboxDb db=new InboxDb(c)){db.receive(raw,System.currentTimeMillis()+86400000);assertEquals(0,db.count("1"));policy(c,false);AppPush.preferences(c).edit().putBoolean("tradeEnabled",false).commit();db.receive(raw+" new",System.currentTimeMillis());assertEquals(0,db.count("1"));}
  AppPush.unbind(c);assertEquals("",AppPush.preferences(c).getString("inboxOwner",""));c.deleteDatabase("broker-inbox.db");
 }
 @Test public void perAccountKindsMaskedAmbiguityAndTargetOutOfOrder()throws Exception{
  Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();AppPush.unbind(c);policy(c,true);AppPush.preferences(c).edit().putString("inboxOwner","1").putBoolean("newsEnabled",true).putBoolean("targetEnabled",true).putString("binding","fixture").commit();
  assertEquals("1",AccountAlerts.resolve(c,"1234-**-5678"));assertFalse(AccountAlerts.allowed(c,"2","BUY"));assertFalse(AccountAlerts.allowed(c,"1","UNKNOWN"));
  org.json.JSONArray rows=AccountAlerts.accounts(c);org.json.JSONObject duplicate=new org.json.JSONObject(rows.getJSONObject(0).toString()).put("id","2");rows.put(duplicate);AccountAlerts.save(c,rows.toString());assertEquals("",AccountAlerts.resolve(c,"1234-**-5678"));policy(c,true);
  rows=AccountAlerts.accounts(c);rows.getJSONObject(0).put("buyEnabled",false);AccountAlerts.save(c,rows.toString());assertFalse(AccountAlerts.allowed(c,"1","BUY"));assertTrue(AccountAlerts.allowed(c,"1","SELL"));policy(c,false);assertFalse(AccountAlerts.allowed(c,"1","SELL"));policy(c,true);
  // No authenticated WebView cookie: neither cached preferences nor a fake event can bypass the server fence.
  assertFalse(AccountAlerts.serverAllowed(c,"1","BUY"));

 }

 private void targetOutOfOrder(Context c,NotificationManager m)throws Exception{
policy(c,true);AppPush.preferences(c).edit().putBoolean("targetEnabled",true).commit();m.cancelAll();
  java.util.Map<String,String> data=new java.util.HashMap<>();data.put("eventId",java.util.UUID.randomUUID().toString());data.put("kind","TARGET");data.put("binding",AppPush.preferences(c).getString("binding",""));data.put("accountId","1");data.put("securityId",String.valueOf(System.currentTimeMillis()));data.put("targetDay","2026-10-24");data.put("targetRate","20");data.put("expiresAt",String.valueOf(System.currentTimeMillis()+600000));
  AppPush.display(c,data);expectCount(m,1);m.cancelAll();data.put("eventId",java.util.UUID.randomUUID().toString());data.put("targetRate","15");AppPush.display(c,data);expectCount(m,0);data.put("targetRate","20");AppPush.display(c,data);expectCount(m,0);data.put("targetDay","2026-10-25");AppPush.display(c,data);expectCount(m,1);m.cancelAll();data.put("eventId",java.util.UUID.randomUUID().toString());data.put("targetDay","2026-10-24");data.put("targetRate","30");AppPush.display(c,data);expectCount(m,0);m.cancelAll();
 }

}
