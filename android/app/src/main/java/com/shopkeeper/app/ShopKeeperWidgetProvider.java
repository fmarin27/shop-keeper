package com.shopkeeper.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

public class ShopKeeperWidgetProvider extends AppWidgetProvider {
    private static final String PREFS_NAME = "shop_keeper_widget";
    private static final String KEY_UNREAD_COUNT = "unread_count";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        int count = readUnreadCount(context);
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId, count);
        }
    }

    public static void updateAllWidgets(Context context, int count) {
        writeUnreadCount(context, count);
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName widget = new ComponentName(context, ShopKeeperWidgetProvider.class);
        int[] widgetIds = manager.getAppWidgetIds(widget);

        for (int appWidgetId : widgetIds) {
            updateWidget(context, manager, appWidgetId, count);
        }
    }

    private static void updateWidget(
        Context context,
        AppWidgetManager appWidgetManager,
        int appWidgetId,
        int count
    ) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.shop_keeper_widget);
        int safeCount = Math.max(0, count);
        views.setTextViewText(R.id.widgetCount, safeCount > 99 ? "99+" : String.valueOf(safeCount));
        views.setTextViewText(R.id.widgetState, safeCount == 0 ? "CLEAR" : "LIVE");
        views.setTextViewText(R.id.widgetLabel, safeCount == 0 ? "All Clear" : "Needs Attention");
        views.setTextViewText(
            R.id.widgetSubLabel,
            safeCount == 0
                ? "Tap to open the shop floor"
                : (safeCount == 1 ? "1 unread update waiting" : safeCount + " unread updates waiting")
        );
        views.setTextViewText(R.id.widgetFooter, safeCount == 0 ? "Tap to open" : "Tap to review");

        Intent launchIntent = new Intent(context, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        views.setOnClickPendingIntent(R.id.widgetRoot, pendingIntent);
        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    private static void writeUnreadCount(Context context, int count) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putInt(KEY_UNREAD_COUNT, count).apply();
        ShopKeeperBadgeWidgetProvider.updateAllWidgets(context, count);
    }

    private static int readUnreadCount(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getInt(KEY_UNREAD_COUNT, 0);
    }
}
