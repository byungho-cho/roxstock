package com.roxstock.app;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;

/** User-scoped account policy shared by broker and FCM display paths. No selected-account fallback. */
final class AccountAlerts {
 static final java.util.concurrent.ExecutorService dispatch=java.util.concurrent.Executors.newSingleThreadExecutor();
 static boolean serverAllowed(Context c,String accountId,String kind){
  return serverAllowed(c,accountId,kind,"");
 }
 static boolean serverAllowed(Context c,String accountId,String kind,String eventId){
  java.net.HttpURLConnection connection=null;
  try{
   String owner=AppPush.preferences(c).getString("inboxOwner","");
   if(owner.isEmpty()||!accountId.matches("[1-9][0-9]{0,19}")||!allowed(c,accountId,kind))return false;
   String cookie=android.webkit.CookieManager.getInstance().getCookie(BuildConfig.SITE_ORIGIN);if(cookie==null||cookie.isEmpty())return false;
   if(!eventId.isEmpty()&&!eventId.matches("[a-f0-9-]{36}"))return false;
   java.net.URL url=new java.net.URL(BuildConfig.SITE_ORIGIN+"/api/notifications/eligibility?accountId="+accountId+"&kind="+kind+(eventId.isEmpty()?"":"&eventId="+eventId));
   connection=(java.net.HttpURLConnection)url.openConnection();connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(4000);connection.setReadTimeout(4000);connection.setRequestProperty("Cookie",cookie);connection.setRequestProperty("X-Auth-User",owner);
   if(connection.getResponseCode()!=200)return false;
   java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();try(java.io.InputStream input=connection.getInputStream()){byte[] buffer=new byte[512];int size;while((size=input.read(buffer))!=-1){if(out.size()+size>4096)return false;out.write(buffer,0,size);}}
   return owner.equals(AppPush.preferences(c).getString("inboxOwner",""))&&new JSONObject(out.toString("UTF-8")).getJSONObject("data").optBoolean("allowed");
  }catch(Exception e){return false;}finally{if(connection!=null)connection.disconnect();}
 }
 static JSONArray accounts(Context c){try{return new JSONArray(AppPush.preferences(c).getString("accounts","[]"));}catch(Exception e){return new JSONArray();}}
 static boolean allowed(Context c,String accountId,String kind){
  String field="BUY".equals(kind)?"buyEnabled":"SELL".equals(kind)?"sellEnabled":"DIVIDEND".equals(kind)?"dividendEnabled":"NEWS".equals(kind)?"newsEnabled":"TARGET".equals(kind)?"targetEnabled":"";
  JSONArray rows=accounts(c);
  for(int i=0;i<rows.length();i++){JSONObject a=rows.optJSONObject(i);if(a!=null&&accountId.equals(a.optString("id")))return a.optBoolean("enabled")&&a.optBoolean(field);}
  return false;
 }
 static boolean matches(String pattern,String number){
  String p=pattern.replaceAll("[\\s-]",""),n=number.replaceAll("[\\s-]","");
  if(p.length()<6||p.length()!=n.length()||!p.matches("[0-9*]+"))return false;
  for(int i=0;i<p.length();i++)if(p.charAt(i)!='*'&&p.charAt(i)!=n.charAt(i))return false;
  return true;
 }
 static String resolve(Context c,String pattern){
  String found="";int count=0;JSONArray rows=accounts(c);
  for(int i=0;i<rows.length();i++){JSONObject a=rows.optJSONObject(i);if(a!=null&&a.optString("brokerName").contains("미래")&&matches(pattern,a.optString("accountNumber"))){found=a.optString("id");count++;}}
  return count==1?found:"";
 }
 static String account(String raw){java.util.regex.Matcher m=java.util.regex.Pattern.compile("(?:^|\\n)\\s*(?:계좌번호|계좌)\\s*[:：]\\s*([^\\n]+)").matcher(raw);return m.find()?m.group(1).trim():"";}
 static String kind(String raw){return raw.matches("(?s).*매매구분\\s*[:：]\\s*매수.*")?"BUY":raw.matches("(?s).*매매구분\\s*[:：]\\s*매도.*")?"SELL":raw.contains("권리 입금 안내")?"DIVIDEND":"";}
 static void save(Context c,String json)throws Exception{
  JSONArray rows=new JSONArray(json);if(rows.length()>1000)throw new IllegalArgumentException();
  for(int i=0;i<rows.length();i++)if(!rows.getJSONObject(i).getString("id").matches("[1-9][0-9]{0,19}"))throw new IllegalArgumentException();
  AppPush.preferences(c).edit().putString("accounts",rows.toString()).commit();
 }
}
