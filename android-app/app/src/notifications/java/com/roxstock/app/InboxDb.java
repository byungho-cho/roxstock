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
    InboxDb(Context context) { super(context, "broker-inbox.db", null, 1); }
    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE inbox (id TEXT PRIMARY KEY, raw TEXT NOT NULL, received INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending')");
    }
    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) { }
    private static String find(String text, String regex) {
        Matcher matcher = Pattern.compile(regex).matcher(text);
        return matcher.find() ? matcher.group(1) : "";
    }
    void receive(String raw, long receivedAt) throws Exception {
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
        values.put("id", id.toString()); values.put("raw", raw); values.put("received", receivedAt);
        getWritableDatabase().insertWithOnConflict("inbox", null, values, SQLiteDatabase.CONFLICT_IGNORE);
    }
    JSONArray list() throws Exception {
        JSONArray rows = new JSONArray();
        try (Cursor cursor = getReadableDatabase().rawQuery("SELECT id, raw, received, status FROM inbox ORDER BY received DESC", null)) {
            while (cursor.moveToNext()) rows.put(new JSONObject().put("id", cursor.getString(0)).put("raw", cursor.getString(1)).put("receivedAt", cursor.getLong(2)).put("status", cursor.getString(3)));
        }
        return rows;
    }
    void status(String id, String state) {
        if (!state.equals("completed") && !state.equals("ignored")) throw new IllegalArgumentException("Invalid status");
        ContentValues values = new ContentValues(); values.put("status", state);
        getWritableDatabase().update("inbox", values, "id = ? AND status = 'pending'", new String[]{id});
    }
}
