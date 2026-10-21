package com.roxstock.app;
public final class PushApplication extends android.app.Application {
 @Override public void onCreate(){super.onCreate();AppPush.initialize(this);}
}
