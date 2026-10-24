package cn.zaichang.location;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.Bundle;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONArray;

/** A visible permission entry point. It never starts itself after a reboot. */
public final class BridgeActivity extends Activity {
    private String session = "";
    private String workoutId = "";
    private boolean simulated;
    private boolean motionPermissionAsked;
    private TextView message;
    @Override public void onCreate(Bundle state) { super.onCreate(state); show(getIntent()); }
    @Override public void onNewIntent(Intent intent) { super.onNewIntent(intent); setIntent(intent); show(intent); }
    private void show(Intent intent) {
        session = intent.getStringExtra("session");
        motionPermissionAsked = false;
        if (session == null || !session.matches("[a-f0-9-]{36}")) session = "";
        workoutId = intent.getStringExtra("workoutId");
        if (workoutId == null || !workoutId.matches("[a-f0-9-]{36}")) workoutId = "";
        simulated = intent.getBooleanExtra("simulated", false);
        LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL); layout.setPadding(36, 56, 36, 36);
        message = new TextView(this); message.setTextSize(20); layout.addView(message);
        Button start = new Button(this); start.setText("允许本次运动读取位置"); layout.addView(start);
        Button stop = new Button(this); stop.setText("停止读取位置"); layout.addView(stop); setContentView(layout);
        start.setOnClickListener(view -> requestLocation());
        stop.setOnClickListener(view -> { BridgeState.stop(this, session, workoutId); message.setText(BridgeState.active(this, session) ? "设备还没有确认停止，请重新连接后重试。" : "定位已停止。"); });
        if (session.isEmpty() || workoutId.isEmpty()) { message.setText("请从桌面在场开始本次运动，再允许读取这台设备的位置。位置只通过已授权的本机调试连接交给桌面。"); start.setEnabled(false); }
        else if (BridgeState.cancelled(this, session)) { message.setText("这次位置读取已经停止。请从桌面重新开始后再继续。"); start.setEnabled(false); }
        else if (!BridgeState.preferences(this).getString("session", "").isEmpty() && !BridgeState.owns(this, session, workoutId)) { message.setText("设备正在处理另一段位置读取。请先在原来的运动里停止，再开始这次。"); start.setEnabled(false); }
        else {
            BridgeState.preferences(this).edit().putString("session", session).putString("workoutId", workoutId).commit();
            BridgeState.write(this, session, "starting", "请允许本次运动使用位置。", new JSONArray());
            message.setText("本次运动需要这台设备的位置。停止运动会关闭定位；模拟器位置会始终标为模拟。");
            requestLocation();
        }
    }
    private void requestLocation() {
        if (!BridgeState.active(this, session)) return;
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) begin();
        else requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, 1);
    }
    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (!BridgeState.active(this, session)) return;
        if (code == 2) { begin(); return; }
        if (code != 1) return;
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) begin();
        else { message.setText("没有取得位置权限。本次不会采样；可以继续使用桌面手动选择地图起点。"); BridgeState.write(this, session, "denied", "Android 没有允许读取位置。", new JSONArray()); }
    }
    private void begin() {
        if (!BridgeState.active(this, session)) return;
        SensorManager sensors = getSystemService(SensorManager.class);
        boolean hasSteps = sensors != null && (sensors.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR) != null || sensors.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null);
        if (Build.VERSION.SDK_INT >= 29 && hasSteps && !motionPermissionAsked && checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) != PackageManager.PERMISSION_GRANTED) {
            motionPermissionAsked = true;
            message.setText("这台设备有计步传感器。允许身体活动后可记录步频；不允许仍能继续定位。");
            requestPermissions(new String[]{Manifest.permission.ACTIVITY_RECOGNITION}, 2); return;
        }
        Intent intent = new Intent(this, LocationService.class); intent.putExtra("session", session); intent.putExtra("workoutId", workoutId); intent.putExtra("simulated", simulated);
        try { startForegroundService(intent); message.setText("正在读取本次运动的位置。可以返回桌面；停止运动或点下方按钮会关闭读取。"); }
        catch (Exception error) { BridgeState.write(this, session, "unavailable", "Android 暂时无法启动本次定位，请保持此页在前台后重试。", new JSONArray()); }
    }
}
