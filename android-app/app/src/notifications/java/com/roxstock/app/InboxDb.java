package com.roxstock.app;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import org.json.JSONArray;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class InboxDb extends SQLiteOpenHelper {
    private final Context context;
    InboxDb(Context context) { super(context, "broker-inbox.db", null, 2); this.context=context; }
    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE inbox (id TEXT PRIMARY KEY, raw TEXT NOT NULL, received INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', owner TEXT)");
        db.execSQL("CREATE TABLE receipts (fingerprint TEXT PRIMARY KEY)");db.execSQL("CREATE INDEX inbox_owner_pending ON inbox(owner,status,received)");
    }
    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) { if(oldVersion<2){db.execSQL("ALTER TABLE inbox ADD COLUMN owner TEXT");db.execSQL("CREATE TABLE receipts (fingerprint TEXT PRIMARY KEY)");db.execSQL("CREATE INDEX inbox_owner_pending ON inbox(owner,status,received)");
        try(Cursor c=db.rawQuery("SELECT raw FROM inbox",null)){while(c.moveToNext()){ContentValues v=new ContentValues();v.put("fingerprint",fingerprint(c.getString(0)));db.insertWithOnConflict("receipts",null,v,SQLiteDatabase.CONFLICT_IGNORE);}}
    } }
    private static String fingerprint(String raw){
        try {byte[] hash=MessageDigest.getInstance("SHA-256").digest(raw.replaceAll("\\s+"," ").trim().getBytes(StandardCharsets.UTF_8));StringBuilder out=new StringBuilder();for(byte b:hash)out.append(String.format(Locale.ROOT,"%02x",b&0xff));return out.toString();}catch(Exception e){throw new IllegalStateException();}
    }
    private static String find(String text, String regex) {
        Matcher matcher = Pattern.compile(regex).matcher(text);
        return matcher.find() ? matcher.group(1) : "";
    }
    void receive(String raw, long receivedAt) throws Exception {
        String owner=AppPush.preferences(context).getString("inboxOwner", "");
        if(owner.isEmpty() || !AppPush.preferences(context).getBoolean("tradeEnabled",false))return;
        if (raw.length() > 20000 || !raw.contains("[미래에셋증권]")) return;
        boolean trade = raw.matches("(?s).*\\[미래에셋증권\\]\\s*전량체결.*") && raw.matches("(?s).*매매구분\\s*[:：]\\s*(매수|매도).*");
        boolean dividend = raw.contains("권리 입금 안내") && raw.matches("(?s).*배당금\\s*입금.*");
        if (!trade && !dividend) return;
        SimpleDateFormat day = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT);
        day.setTimeZone(TimeZone.getTimeZone("Asia/Seoul"));
        String account = find(raw, "([0-9*]+(?:-[0-9*]+){2,})");
        String order = find(raw, "주문번호\\s*[:：]\\s*(\\d+)");
        String side = find(raw, "매매구분\\s*[:：]\\s*(매수|매도)");
        String basis = trade && !order.isEmpty() && !account.isEmpty() ? account + "|" + side + "|" + order : raw.replaceAll("\\s+", " ").trim();
        byte[] hash = MessageDigest.getInstance("SHA-256").digest((day.format(new Date(receivedAt)) + "|" + basis).getBytes(StandardCharsets.UTF_8));
        StringBuilder id = new StringBuilder();
        for (byte b : hash) id.append(String.format(Locale.ROOT, "%02x", b & 0xff));
        ContentValues values = new ContentValues();
        values.put("owner",owner); values.put("id", id.toString()); values.put("raw", raw); values.put("received", receivedAt);
        SQLiteDatabase db=getWritableDatabase();db.beginTransaction();try{
            ContentValues receipt=new ContentValues();receipt.put("fingerprint",fingerprint(raw));
            if(db.insertWithOnConflict("receipts",null,receipt,SQLiteDatabase.CONFLICT_IGNORE)!=-1)db.insertWithOnConflict("inbox", null, values, SQLiteDatabase.CONFLICT_IGNORE);
            db.setTransactionSuccessful();
        }finally{db.endTransaction();}
    }
    int count(String owner) {
        try(Cursor c=getReadableDatabase().rawQuery("SELECT count(*) FROM inbox WHERE owner = ? AND status = 'pending'",new String[]{owner})) {return c.moveToFirst()?c.getInt(0):0;}
    }
    JSONArray list(String owner) throws Exception {
        JSONArray rows = new JSONArray();
        try (Cursor cursor = getReadableDatabase().rawQuery("SELECT id, raw, received, status FROM inbox WHERE owner = ? AND status = 'pending' ORDER BY received DESC LIMIT 1000", new String[]{owner})) {
            while (cursor.moveToNext()) rows.put(new JSONObject().put("id", cursor.getString(0)).put("raw", cursor.getString(1)).put("receivedAt", cursor.getLong(2)).put("status", cursor.getString(3)));
        }
        return rows;
    }
    void status(String id, String state, String owner) {
        if (!state.equals("completed") && !state.equals("ignored")) throw new IllegalArgumentException("Invalid status");
        ContentValues values = new ContentValues(); values.put("status", state);
        getWritableDatabase().update("inbox", values, "id = ? AND status = 'pending' AND owner = ?", new String[]{id,owner});
    }
}
