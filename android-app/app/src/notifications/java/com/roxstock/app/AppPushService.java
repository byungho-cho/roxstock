package com.roxstock.app;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
public final class AppPushService extends FirebaseMessagingService {
 @Override public void onMessageReceived(RemoteMessage message){AppPush.initialize(this);java.util.Map<String,String> data=message.getData();if(AccountAlerts.serverAllowed(this,data.getOrDefault("accountId",""),data.getOrDefault("kind",""),data.getOrDefault("eventId","")))AppPush.display(this,data);}
 @Override public void onNewToken(String token){
  // Rebind through an authenticated, origin-restricted WebView on next resume.
  AppPush.tokenChanged(this,token);
 }
}
