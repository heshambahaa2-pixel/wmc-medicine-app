package com.wmcmedicine.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel("wmc_daily", "Daily question & announcements", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Question of the day and program announcements");
            getSystemService(NotificationManager.class).createNotificationChannel(ch);
        }
    }
}
