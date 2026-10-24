import SwiftUI
import CoreLocation

@MainActor final class LocationBridge: NSObject, ObservableObject, @preconcurrency CLLocationManagerDelegate {
    @Published private(set) var message = "从电脑上的地图开始一次运动"
    @Published private(set) var listening = false
    private let manager = CLLocationManager()
    private var timer: Timer?
    private var commandTimer: Timer?
    private var lastCommandId = ""
    private var closedNonces: [String] = []
    private var workoutId = ""
    private var nonce = ""
    private var deadline: TimeInterval = 0
    private var sequence = 0
    private var points: [[String: Any]] = []
    private var state = "stopped"
    private var lastLocationTime: TimeInterval = 0
    private var subscriptionStartedAt: TimeInterval = 0
    private let file = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("workout-location.json")
    private let controlFile = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("workout-control.json")

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = kCLDistanceFilterNone
        manager.activityType = .fitness
        // A process restart never resumes a subscription or restores precise points.
        if let data = try? Data(contentsOf: file),
           let old = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            workoutId = old["workoutId"] as? String ?? ""
            nonce = old["nonce"] as? String ?? ""
            closedNonces = Array((old["closedNonces"] as? [String] ?? []).suffix(64))
            if !nonce.isEmpty && !closedNonces.contains(nonce) { closedNonces.append(nonce) }
        }
        // A command left behind by an earlier process cannot resume location.
        if let data = try? Data(contentsOf: controlFile),
           let old = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            lastCommandId = old["commandId"] as? String ?? ""
        }
        persist()
        commandTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.readControl() }
        }
    }

    private func readControl() {
        guard let data = try? Data(contentsOf: controlFile), data.count <= 4096,
              let command = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              command["version"] as? Int == 1,
              let commandId = command["commandId"] as? String, valid(commandId), commandId != lastCommandId,
              let issuedAt = command["issuedAt"] as? Double,
              abs(Date().timeIntervalSince1970 * 1000 - issuedAt) < 15000,
              let action = command["action"] as? String, ["start", "heartbeat", "stop"].contains(action),
              let owner = command["workoutId"] as? String, valid(owner),
              let token = command["nonce"] as? String, valid(token) else { return }
        lastCommandId = commandId
        handle(action: action, owner: owner, token: token)
    }

    private func handle(action: String, owner: String, token: String) {
        let same = owner == workoutId && token == nonce
        switch action {
        case "start":
            guard !closedNonces.contains(token) else { return }
            // No unrelated owner can take over an active subscription.
            guard !listening || same else { return }
            if !same { sequence = 0; points = []; lastLocationTime = 0 }
            workoutId = owner; nonce = token
            deadline = ProcessInfo.processInfo.systemUptime + 20
            timer?.invalidate()
            timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
                Task { @MainActor in
                    guard let self else { return }
                    if ProcessInfo.processInfo.systemUptime >= self.deadline { self.stop("与电脑断开了，位置已停止", status: "lease-expired") }
                }
            }
            state = "starting"
            manager.requestWhenInUseAuthorization()
            startIfAllowed()
        case "heartbeat":
            guard same, listening else { return }
            deadline = ProcessInfo.processInfo.systemUptime + 20
        case "stop":
            guard same else { return }
            stop("位置已停止")
        default: return
        }
        persist()
    }

    private func valid(_ value: String) -> Bool {
        !value.isEmpty && value.count <= 128 && value.unicodeScalars.allSatisfy {
            CharacterSet.alphanumerics.contains($0) || "-_.:".unicodeScalars.contains($0)
        }
    }

    private func startIfAllowed() {
        guard state == "starting" else { return }
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            listening = true; state = "listening"; message = "正随本次运动记录位置"
            subscriptionStartedAt = Date().timeIntervalSince1970
            manager.startUpdatingLocation()
        case .denied, .restricted:
            stop("没有允许位置，运动已停在这里", status: "denied")
        case .notDetermined: message = "等你选择是否允许位置"
        @unknown default: stop("这次没有取得位置", status: "unavailable")
        }
        persist()
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if listening && (manager.authorizationStatus == .denied || manager.authorizationStatus == .restricted) {
            stop("位置权限已关闭", status: "denied")
        } else { startIfAllowed() }
    }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if (error as? CLError)?.code == .denied { stop("位置权限已关闭", status: "denied") }
    }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard listening else { return }
        for location in locations {
            let stamp = location.timestamp.timeIntervalSince1970
            guard stamp.isFinite, stamp >= subscriptionStartedAt, stamp > lastLocationTime,
                  location.horizontalAccuracy.isFinite, location.horizontalAccuracy >= 0,
                  CLLocationCoordinate2DIsValid(location.coordinate) else { continue }
            lastLocationTime = stamp; sequence += 1
            func optional(_ value: Double, valid: Bool) -> Any { valid && value.isFinite ? value : NSNull() }
            var point: [String: Any] = [
                "sequence": sequence, "longitude": location.coordinate.longitude, "latitude": location.coordinate.latitude,
                "timestamp": stamp * 1000, "accuracy": location.horizontalAccuracy,
                "altitude": optional(location.altitude, valid: location.verticalAccuracy > 0),
                "altitudeAccuracy": optional(location.verticalAccuracy, valid: location.verticalAccuracy > 0),
                "speed": optional(location.speed, valid: location.speed >= 0),
                "heading": optional(location.course, valid: location.course >= 0)
            ]
            if #available(iOS 15.0, *) { point["simulatedBySoftware"] = location.sourceInformation?.isSimulatedBySoftware ?? false }
            points.append(point)
        }
        points = Array(points.suffix(16))
        persist()
    }

    func stop(_ reason: String = "位置已停止", status: String = "stopped") {
        manager.stopUpdatingLocation()
        timer?.invalidate(); timer = nil
        listening = false; state = status; message = reason; points = []
        if !nonce.isEmpty && !closedNonces.contains(nonce) { closedNonces.append(nonce) }
        closedNonces = Array(closedNonces.suffix(64))
        persist()
    }

    private func persist() {
        let value: [String: Any] = ["version": 1, "workoutId": workoutId, "nonce": nonce,
            "commandId": lastCommandId, "processId": ProcessInfo.processInfo.processIdentifier,
            "closedNonces": closedNonces,
            "status": state, "activeSubscriptions": listening ? 1 : 0,
            "sequence": sequence, "updatedAt": Date().timeIntervalSince1970 * 1000, "points": points]
        guard let data = try? JSONSerialization.data(withJSONObject: value) else { return }
        do { try data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]) }
        catch { stopWithoutWrite() }
    }
    private func stopWithoutWrite() {
        manager.stopUpdatingLocation(); timer?.invalidate(); timer = nil
        listening = false; state = "unavailable"; points = []; message = "位置没有保存好，已停止记录"
    }
}

@main struct ZaichangLocationApp: App {
    @StateObject private var bridge = LocationBridge()
    @Environment(\.scenePhase) private var phase
    var body: some Scene {
        WindowGroup {
            VStack(alignment: .leading, spacing: 24) {
                Image(systemName: "figure.walk").font(.system(size: 46, weight: .light)).foregroundStyle(Color(red: 0.59, green: 0.44, blue: 0.20))
                Text("位置随行").font(.system(.largeTitle, design: .serif).weight(.medium))
                    .foregroundStyle(Color(red: 0.36, green: 0.33, blue: 0.28))
                Text(bridge.message).font(.title3).foregroundStyle(Color(red: 0.43, green: 0.40, blue: 0.35))
                #if targetEnvironment(simulator)
                Text("模拟器位置 · 不代表现实中的你").font(.footnote).foregroundStyle(.secondary)
                #endif
                Button { bridge.stop() } label: {
                    Label("停止位置", systemImage: "stop.fill")
                        .font(.title3.weight(.medium)).frame(maxWidth: .infinity, minHeight: 44)
                }
                    .buttonStyle(.borderedProminent).tint(Color(red: 0.59, green: 0.44, blue: 0.20))
                    .opacity(bridge.listening ? 1 : 0).disabled(!bridge.listening).accessibilityHidden(!bridge.listening)
            }
            .padding(32).frame(maxWidth: 460, maxHeight: .infinity, alignment: .leading)
            .frame(maxWidth: .infinity).background(Color(red: 0.98, green: 0.97, blue: 0.94))
            .onChange(of: phase) { next in if next == .background { bridge.stop("已离开位置随行，位置停止了") } }
        }
    }
}
