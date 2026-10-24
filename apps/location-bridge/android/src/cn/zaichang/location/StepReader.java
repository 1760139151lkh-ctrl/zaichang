package cn.zaichang.location;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.Handler;
import android.os.SystemClock;
import android.provider.Settings;
import org.json.JSONArray;
import org.json.JSONObject;

/** Bounded raw step-sensor handoff for the same explicit location subscription. */
final class StepReader implements SensorEventListener {
    private final Context context;
    private final String session;
    private final boolean simulated;
    private final Runnable changed;
    private final JSONArray observations = new JSONArray();
    private SensorManager manager;
    private Sensor sensor;
    private boolean registered;
    private long sequence;
    private long detectedSteps;
    private String status = "unavailable";

    StepReader(Context context, String session, boolean simulated, Handler handler, Runnable changed) {
        this.context = context; this.session = session; this.simulated = simulated; this.changed = changed;
        manager = context.getSystemService(SensorManager.class);
        if (manager == null) { append(null, SystemClock.elapsedRealtime()); return; }
        sensor = manager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR);
        if (sensor == null) sensor = manager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
        if (sensor == null) { status = "unsupported"; append(null, SystemClock.elapsedRealtime()); return; }
        if (!allowed()) { status = "denied"; append(null, SystemClock.elapsedRealtime()); return; }
        try {
            registered = manager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_NORMAL, 0, handler);
            status = registered ? "listening" : "unavailable";
        } catch (SecurityException denied) { status = "denied"; }
        catch (Exception unavailable) { status = "unavailable"; }
        append(null, SystemClock.elapsedRealtime());
    }

    private boolean allowed() {
        return Build.VERSION.SDK_INT < 29 || context.checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED;
    }
    private String permission() { return Build.VERSION.SDK_INT < 29 ? "not-required" : allowed() ? "granted" : "denied"; }
    int subscriptionCount() { return registered ? 1 : 0; }
    JSONArray snapshot() {
        if (registered && !allowed()) {
            manager.unregisterListener(this); registered = false; status = "denied";
            while (observations.length() > 0) observations.remove(0);
            append(null, SystemClock.elapsedRealtime());
        }
        return observations;
    }
    @Override public void onSensorChanged(SensorEvent event) {
        if (!registered || !BridgeState.active(context, session)) return;
        if (!allowed()) { snapshot(); changed.run(); return; }
        if (event.sensor != sensor || event.values.length == 0 || !Float.isFinite(event.values[0])) return;
        double count;
        if (sensor.getType() == Sensor.TYPE_STEP_DETECTOR) {
            if (event.values[0] != 1.0f) return;
            count = ++detectedSteps;
        } else {
            count = event.values[0];
            if (count < 0 || count != Math.floor(count)) return;
        }
        append(count, event.timestamp / 1000000.0); changed.run();
    }
    @Override public void onAccuracyChanged(Sensor sensor, int accuracy) { }
    private void append(Double steps, double elapsedMs) {
        try {
            JSONObject value = new JSONObject();
            value.put("sequence", ++sequence); value.put("status", status);
            value.put("source", sensor == null ? JSONObject.NULL : sensor.getType() == Sensor.TYPE_STEP_DETECTOR ? "android-step-detector" : "android-step-counter");
            value.put("permission", permission());
            value.put("deviceId", BridgeState.deviceId(context)); value.put("subscriptionId", session);
            value.put("clockId", BridgeState.deviceId(context) + ":" + Settings.Global.getInt(context.getContentResolver(), "boot_count", -1));
            value.put("elapsedRealtimeMs", elapsedMs);
            value.put("timestamp", System.currentTimeMillis() - (SystemClock.elapsedRealtime() - elapsedMs));
            value.put("cumulativeSteps", steps == null ? JSONObject.NULL : steps);
            value.put("provenance", simulated ? "simulated" : "device");
            if (sensor != null) {
                JSONObject details = new JSONObject(); details.put("name", sensor.getName()); details.put("vendor", sensor.getVendor()); details.put("version", sensor.getVersion());
                value.put("sensor", details);
            }
            observations.put(value); while (observations.length() > 64) observations.remove(0);
        } catch (Exception ignored) { /* Raw sensor observations never enter logs. */ }
    }
    void release() {
        if (manager != null && registered) manager.unregisterListener(this);
        registered = false; status = "stopped";
        while (observations.length() > 0) observations.remove(0);
    }
}
