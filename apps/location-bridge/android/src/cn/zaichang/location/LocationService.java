package cn.zaichang.location;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.hardware.Sensor;
import android.hardware.SensorManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import org.json.JSONArray;
import org.json.JSONObject;

public final class LocationService extends Service implements LocationListener {
    private static LocationService activeService;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final JSONArray fixes = new JSONArray();
    private LocationManager manager;
    private String session = "";
    private String status = "starting";
    private String reason = "正在等待设备位置。";
    private long sequence;
    private boolean simulated;
    private long leaseUntil;
    private int subscriptions;
    private StepReader steps;
    static void renewLease(String session) { if (activeService != null && activeService.session.equals(session)) activeService.leaseUntil = SystemClock.elapsedRealtime() + 20000; }
    static int subscriptionCount(String session) { return activeService != null && activeService.session.equals(session) ? activeService.subscriptions : 0; }
    static int sensorSubscriptionCount(String session) { return activeService != null && activeService.session.equals(session) && activeService.steps != null ? activeService.steps.subscriptionCount() : 0; }
    static JSONArray cadenceSnapshot(String session) { return activeService != null && activeService.session.equals(session) && activeService.steps != null ? activeService.steps.snapshot() : new JSONArray(); }
    static boolean stopSession(String session) {
        if (activeService == null || !activeService.session.equals(session)) return true;
        try { activeService.release(); while (activeService.fixes.length() > 0) activeService.fixes.remove(0); return true; }
        catch (Exception uncertain) { return false; }
    }
    private final Runnable heartbeat = new Runnable() { public void run() { if (BridgeState.active(LocationService.this, session) && SystemClock.elapsedRealtime() < leaseUntil) { publish(); handler.postDelayed(this, 5000); } else { BridgeState.stop(LocationService.this, session); stopSelf(); } } };
    @Override public IBinder onBind(Intent intent) { return null; }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) { stopSelf(); return START_NOT_STICKY; }
        String incoming = intent.getStringExtra("session");
        if (incoming == null || !BridgeState.owns(this, incoming, intent.getStringExtra("workoutId"))) { stopSelf(); return START_NOT_STICKY; }
        if (incoming.equals(session) && manager != null) return START_NOT_STICKY;
        release(); session = incoming; sequence = 0; while (fixes.length() > 0) fixes.remove(0);
        activeService = this; renewLease(session);
        simulated = intent.getBooleanExtra("simulated", false) || emulator();
        NotificationManager notifications = getSystemService(NotificationManager.class);
        notifications.createNotificationChannel(new NotificationChannel("location", "本次运动定位", NotificationManager.IMPORTANCE_LOW));
        Intent stop = new Intent(this, StopReceiver.class); stop.putExtra("session", session); stop.putExtra("workoutId", intent.getStringExtra("workoutId"));
        PendingIntent action = PendingIntent.getBroadcast(this, 0, stop, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(this, "location").setSmallIcon(android.R.drawable.ic_menu_mylocation).setContentTitle("在场正在读取本次运动的位置").setContentText(simulated ? "模拟器位置 · 仅交给本机桌面" : "仅通过授权连接交给本机桌面").setOngoing(true).addAction(new Notification.Action.Builder(null, "停止", action).build()).build();
        if (Build.VERSION.SDK_INT >= 29) {
            int types = ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION;
            SensorManager sensors = getSystemService(SensorManager.class);
            if (Build.VERSION.SDK_INT >= 34 && checkSelfPermission(android.Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED
                && sensors != null && (sensors.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR) != null || sensors.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null)) types |= ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH;
            startForeground(1, notification, types);
        } else startForeground(1, notification);
        manager = getSystemService(LocationManager.class);
        int providers = 0;
        try {
            for (String provider : new String[]{LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER}) {
                if (manager.isProviderEnabled(provider)) { manager.requestLocationUpdates(provider, 1000, 0, this, Looper.getMainLooper()); subscriptions = ++providers; }
            }
            subscriptions = providers;
            status = providers > 0 ? "listening" : "unavailable";
            reason = providers > 0 ? "正在等待设备提供位置。" : "Android 位置服务没有可用来源，请在设备上检查位置开关。";
        } catch (SecurityException denied) { status = "denied"; reason = "Android 没有允许本次运动读取位置。"; }
        catch (Exception error) { status = "unavailable"; reason = "设备暂时无法提供位置。"; }
        if (status.equals("listening")) steps = new StepReader(this, session, simulated, handler, () -> publish());
        publish(); handler.postDelayed(heartbeat, 5000);
        return START_NOT_STICKY;
    }
    private boolean emulator() {
        String build = (Build.FINGERPRINT + " " + Build.HARDWARE + " " + Build.MODEL).toLowerCase(java.util.Locale.ROOT);
        if (build.matches(".*(generic|emulator|goldfish|ranchu|vbox|nemu|qemu).*")) return true;
        try { getPackageManager().getPackageInfo("com.nemu.nlp", 0); return true; } catch (Exception absent) { return false; }
    }
    @Override public void onLocationChanged(Location location) {
        if (!BridgeState.active(this, session)) { stopSelf(); return; }
        try {
            boolean mock = Build.VERSION.SDK_INT >= 31 ? location.isMock() : location.isFromMockProvider();
            JSONObject fix = new JSONObject(); fix.put("sequence", ++sequence);
            fix.put("coordinate", new JSONArray(new double[]{location.getLongitude(), location.getLatitude()}));
            fix.put("crs", "EPSG:4326"); fix.put("timestamp", location.getTime());
            fix.put("elapsedRealtimeMs", location.getElapsedRealtimeNanos() / 1000000.0);
            fix.put("clockId", BridgeState.deviceId(this) + ":" + Settings.Global.getInt(getContentResolver(), "boot_count", -1));
            fix.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : JSONObject.NULL); fix.put("accuracyConfidence", "68-percent");
            fix.put("altitude", location.hasAltitude() ? location.getAltitude() : JSONObject.NULL);
            fix.put("altitudeAccuracy", location.hasVerticalAccuracy() ? location.getVerticalAccuracyMeters() : JSONObject.NULL);
            fix.put("altitudeDatum", "wgs84-ellipsoid");
            fix.put("speed", location.hasSpeed() ? location.getSpeed() : JSONObject.NULL);
            fix.put("heading", location.hasBearing() ? location.getBearing() : JSONObject.NULL);
            fix.put("source", "android-location-manager"); fix.put("provider", location.getProvider());
            fix.put("deviceId", BridgeState.deviceId(this)); fix.put("deviceLabel", Build.MODEL);
            fix.put("provenance", simulated || mock ? "simulated" : "device"); fix.put("mock", mock);
            fixes.put(fix); while (fixes.length() > 64) fixes.remove(0);
            status = "listening"; reason = simulated || mock ? "已收到带模拟来源的位置。" : "已收到设备位置。"; publish();
        } catch (Exception invalid) { status = "unavailable"; reason = "设备返回的位置不完整。"; publish(); }
    }
    @Override public void onProviderEnabled(String provider) { status = "listening"; reason = "设备位置来源已恢复。"; publish(); }
    @Override public void onProviderDisabled(String provider) { status = "unavailable"; reason = "设备位置来源已关闭，等待恢复。"; publish(); }
    @Override public void onStatusChanged(String provider, int state, Bundle extras) { }
    private void publish() { BridgeState.write(this, session, status, reason, fixes); }
    private void release() {
        handler.removeCallbacks(heartbeat);
        try { if (manager != null) { manager.removeUpdates(this); manager = null; } subscriptions = 0; }
        finally { if (steps != null) { steps.release(); steps = null; } }
    }
    @Override public void onDestroy() {
        release(); if (activeService == this) activeService = null;
        if (BridgeState.active(this, session)) { BridgeState.preferences(this).edit().remove("session").commit(); BridgeState.write(this, session, "stopped", "设备上的定位已停止。", new JSONArray()); }
        stopForeground(STOP_FOREGROUND_REMOVE); super.onDestroy();
    }
}
