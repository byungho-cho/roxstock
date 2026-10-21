package com.roxstock.app;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
public final class AppPushService extends FirebaseMessagingService {
 @Override public void onMessageReceived(RemoteMessage message){AppPush.initialize(this);AppPush.display(this,message.getData());}
 @Override public void onNewToken(String token){
  // Rebind through an authenticated, origin-restricted WebView on next resume.
  if(!AppPush.preferences(this).getString("binding","").isEmpty())AppPush.unbind(this);
 }
}
