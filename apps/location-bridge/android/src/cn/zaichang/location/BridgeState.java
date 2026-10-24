package cn.zaichang.location;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.AtomicFile;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.LinkedHashSet;
import java.util.Collections;

/** The bridge keeps a bounded handoff buffer, never a second workout database. */
final class BridgeState {
    static SharedPreferences preferences(Context context) { return context.getSharedPreferences("bridge", Context.MODE_PRIVATE); }
    static String deviceId(Context context) {
        SharedPreferences prefs = preferences(context);
        String id = prefs.getString("installation", "");
        if (id.isEmpty()) { id = UUID.randomUUID().toString(); prefs.edit().putString("installation", id).commit(); }
        return id;
    }
    static boolean active(Context context, String session) { return !session.isEmpty() && session.equals(preferences(context).getString("session", "")); }
    static boolean owns(Context context, String session, String workoutId) { return workoutId != null && workoutId.equals(preferences(context).getString("workoutId", "")) && active(context, session); }
    static boolean cancelled(Context context, String session) { return preferences(context).getStringSet("cancelled", Collections.<String>emptySet()).contains(session); }
    static void write(Context context, String session, String status, String reason, JSONArray fixes) {
        try {
            JSONObject state = new JSONObject();
            state.put("schemaVersion", 1); state.put("session", session); state.put("status", status);
            state.put("workoutId", preferences(context).getString("workoutId", ""));
            state.put("activeSubscriptions", LocationService.subscriptionCount(session));
            state.put("cadence", LocationService.cadenceSnapshot(session));
            state.put("activeSensorSubscriptions", LocationService.sensorSubscriptionCount(session));
            state.put("reason", reason); state.put("updatedAt", System.currentTimeMillis());
            state.put("deviceElapsedRealtimeMs", android.os.SystemClock.elapsedRealtimeNanos() / 1000000.0);
            state.put("deviceId", deviceId(context)); state.put("fixes", fixes);
            AtomicFile file = new AtomicFile(new File(context.getFilesDir(), "location-state.json"));
            FileOutputStream stream = null;
            try { stream = file.startWrite(); stream.write(state.toString().getBytes(StandardCharsets.UTF_8)); file.finishWrite(stream); }
            catch (Exception error) { if (stream != null) file.failWrite(stream); }
        } catch (Exception ignored) { /* No raw coordinates or credentials are logged. */ }
    }
    static void stop(Context context, String session) {
        stop(context, session, preferences(context).getString("workoutId", ""));
    }
    static void stop(Context context, String session, String workoutId) {
        if (session == null || !session.matches("[a-f0-9-]{36}")) return;
        if (workoutId == null || !workoutId.matches("[a-f0-9-]{36}")) return;
        LinkedHashSet<String> cancelled = new LinkedHashSet<>(preferences(context).getStringSet("cancelled", Collections.<String>emptySet()));
        cancelled.add(session);
        while (cancelled.size() > 64) cancelled.remove(cancelled.iterator().next());
        preferences(context).edit().putStringSet("cancelled", cancelled).commit();
        if (!owns(context, session, workoutId)) return;
        // removeUpdates is synchronous. Never publish stopped before it succeeds.
        if (!LocationService.stopSession(session)) {
            write(context, session, "unavailable", "设备还没有确认位置读取已停止，请重新连接后重试。", new JSONArray());
            return;
        }
        preferences(context).edit().remove("session").commit();
        context.stopService(new android.content.Intent(context, LocationService.class));
        write(context, session, "stopped", "定位已停止。", new JSONArray());
    }
}
