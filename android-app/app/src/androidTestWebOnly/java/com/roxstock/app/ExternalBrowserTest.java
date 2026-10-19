package com.roxstock.app;
import static org.junit.Assert.*;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.util.ArrayList;
import java.util.List;
import org.junit.Test;
import org.junit.runner.RunWith;
@RunWith(AndroidJUnit4.class)
public class ExternalBrowserTest {
 @Test public void chromeFirstAndUnavailableChromeFallsBackToDefault() {
  List<Intent> calls = new ArrayList<>();
  assertTrue(ExternalBrowser.open(Uri.parse("https://www.hankyung.com/article/1"), intent -> {
   calls.add(intent);if(calls.size()==1)throw new ActivityNotFoundException();
  }));
  assertEquals(2,calls.size());assertEquals("com.android.chrome",calls.get(0).getPackage());assertNull(calls.get(1).getPackage());
  assertEquals(Intent.ACTION_VIEW,calls.get(1).getAction());assertTrue(calls.get(1).hasCategory(Intent.CATEGORY_BROWSABLE));
 }
 @Test public void chromeSuccessDoesNotOpenTwiceAndInvalidLinksNeverLaunch() {
  List<Intent> calls=new ArrayList<>();
  assertTrue(ExternalBrowser.open(Uri.parse("https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261019000001"),calls::add));assertEquals(1,calls.size());
  for(String link:new String[]{"javascript:alert(1)","file:///tmp/a","https://user:secret@example.com/"})assertFalse(ExternalBrowser.open(Uri.parse(link),calls::add));
  assertEquals(1,calls.size());
  assertFalse(ExternalBrowser.open(Uri.parse("https://www.hankyung.com/article/1"), intent -> {throw new ActivityNotFoundException();}));
 }
}
