"""Personal sport rules and the official exercise submission protocol.

The official client serialises ``UploadJsonSports`` with Gson, then transforms
that JSON into the ``jsonsports`` request value before posting it to
``api/l/v6.1/prejudgment`` or ``api/l/v7/savesports``. Field names and the
request headers were recovered from the shipped application; the body
transform is kept pluggable because its native encoder lives in the official
application bundle, not in this repository.

This module never invents a track, a distance or a receipt. A submission needs
a real, host-supplied track and returns the school's own answer unchanged.
"""

import base64
import json
import re
import time
import urllib.parse

from .common import Failure

MAX_TRACK_POINTS = 4000
SUBMIT_PATHS = {
    "prejudgment": "l/v6.1/prejudgment",
    "savesports": "l/v7/savesports",
}


def _number(value, label, minimum=None, maximum=None):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise Failure("SPORT_INPUT_INVALID", f"{label}必须是数值。")
    value = float(value)
    if (
        minimum is not None
        and value < minimum
        or maximum is not None
        and value > maximum
    ):
        raise Failure("SPORT_INPUT_INVALID", f"{label}超出有效范围。")
    return value


def _point(raw, index):
    if not isinstance(raw, dict):
        raise Failure("SPORT_INPUT_INVALID", "轨迹点格式不完整。")
    lat = _number(raw.get("latitude", raw.get("a")), "纬度", -90, 90)
    lon = _number(raw.get("longitude", raw.get("o")), "经度", -180, 180)
    stamp = raw.get("time", raw.get("t"))
    if isinstance(stamp, bool) or not isinstance(stamp, (int, float)) or stamp <= 0:
        raise Failure("SPORT_INPUT_INVALID", "轨迹点时间不完整。")
    accuracy = _number(raw.get("accuracy", raw.get("ac", 0)), "精度", 0, 10000)
    speed = _number(raw.get("speed", raw.get("s", 0)), "速度", 0, 100)
    distance = _number(raw.get("distance", raw.get("da", 0)), "里程", 0, 200000)
    return {
        "a": round(lat, 6),
        "o": round(lon, 6),
        "ac": round(accuracy, 2),
        "d": round(
            _number(raw.get("lastDistance", raw.get("d", 0)), "增量里程", 0, 200000), 2
        ),
        "da": round(distance, 2),
        "s": round(speed, 3),
        "st": int(raw.get("step", raw.get("st", 0)) or 0),
        "sta": int(raw.get("stepRate", raw.get("sta", 0)) or 0),
        "t": int(stamp),
        "v": int(raw.get("valid", raw.get("v", 1)) or 0),
    }


def build_payload(connection, args):
    """Build the recovered UploadJsonSports object from caller-owned facts."""
    user = connection.session["user"]
    sport_id = args.get("sportId")
    if not isinstance(sport_id, str) or not re.fullmatch(
        r"[A-Za-z0-9-]{8,64}", sport_id
    ):
        raise Failure(
            "SPORT_INPUT_INVALID", "缺少本次锻炼的学校编号，请先读取运动编号。"
        )
    route_id = args.get("sportTypeId")
    if (
        isinstance(route_id, bool)
        or not isinstance(route_id, (int, str))
        or not str(route_id).isdigit()
    ):
        raise Failure("SPORT_INPUT_INVALID", "缺少学校场地编号，请先读取锻炼规则。")
    track = args.get("track")
    if not isinstance(track, list) or not 2 <= len(track) <= MAX_TRACK_POINTS:
        raise Failure("SPORT_INPUT_INVALID", "需要至少两个由设备真实采集的轨迹点。")
    points = [_point(raw, index) for index, raw in enumerate(track)]
    stamps = [point["t"] for point in points]
    if any(later <= earlier for earlier, later in zip(stamps, stamps[1:])):
        raise Failure("SPORT_INPUT_INVALID", "轨迹点时间必须严格递增。")
    first, last = points[0], points[-1]
    odometer = _number(args.get("odometer", last["da"]), "总里程", 0, 200000)
    if odometer <= 0:
        raise Failure("SPORT_INPUT_INVALID", "总里程必须来自本次真实轨迹。")
    indoor = 1 if args.get("indoor") in (1, True, "1") else 0
    name = args.get("name")
    if not isinstance(name, str) or not name.strip() or len(name) > 120:
        raise Failure("SPORT_INPUT_INVALID", "缺少学校场地名称。")
    begin_time = args.get("beginTime")
    end_time = args.get("endTime")
    for value in (begin_time, end_time):
        if not isinstance(value, str) or not re.fullmatch(
            r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}", value
        ):
            raise Failure("SPORT_INPUT_INVALID", "锻炼起止时间不完整。")
    duration = int((stamps[-1] - stamps[0]) / 1000)
    avg_speed = odometer / duration if duration > 0 else 0
    payload = {
        "sportId": sport_id,
        "phoneVersion": str(args.get("phoneVersion") or "android12")[:40],
        "xh": user,
        "name": name.strip(),
        "calorie": round(_number(args.get("calorie", 0), "热量", 0, 100000), 2),
        "indoor": indoor,
        "odometer": f"{odometer:.2f}",
        "avgSpeed": f"{avg_speed:.3f}",
        "activeTime": args.get("activeTime")
        if isinstance(args.get("activeTime"), str)
        else time.strftime("%H:%M:%S", time.gmtime(duration)),
        "beginTime": begin_time,
        "endTime": end_time,
        "isValid": int(args.get("isValid", 0) or 0),
        "sportImages": "",
        "alreadyPassPointResult": str(args.get("alreadyPassPointResult") or "")[:2000],
        "needPassPointCount": str(args.get("needPassPointCount") or "0")[:8],
        "alreadyPassPoint": str(args.get("alreadyPassPoint") or "")[:2000],
        "routePolylineBh": str(args.get("routePolylineBh") or "")[:4000],
        "routeId": str(route_id),
        "planRouteName": str(args.get("planRouteName") or name)[:120],
        "modementMode": str(args.get("modementMode") or args.get("sportType") or "2")[
            :8
        ],
        "isValidReason": str(args.get("isValidReason") or "")[:500],
        "stepCount": int(args.get("stepCount", 0) or 0),
        "pace": args.get("pace") if isinstance(args.get("pace"), list) else [],
        "minuteSpeed": args.get("minuteSpeed")
        if isinstance(args.get("minuteSpeed"), list)
        else [],
        "maxSpeedPerHour": f"{_number(args.get('maxSpeedPerHour', last['s']), '最高速度', 0, 100):.2f}",
        "minSpeedPerHour": "0.10",
        "avgPace": str(args.get("avgPace") or "0")[:16],
        "lastOdometerTime": str(args.get("lastOdometerTime") or "00:00:00")[:16],
        "stepMinute": str(args.get("stepMinute") or "")[:2000],
        "randomPointStr": args.get("randomPointStr")
        if isinstance(args.get("randomPointStr"), list)
        else [],
        "coordinate": points,
        "beganPoint": f"{first['a']}|{first['o']}",
        "endPoint": f"{last['a']}|{last['o']}",
    }
    return payload


def encode_value(payload, encoder, secret):
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    if encoder == "plain":
        return raw
    if encoder != "aes":
        raise Failure("SPORT_ENCODER_UNKNOWN", "没有这个锻炼数据编码方式。")
    # Recovered static parameters of the official AES helper. The school may
    # still require the original application's native transform; a rejection
    # is returned as-is and never reported as a successful submission.
    try:
        from Crypto.Cipher import AES
        from Crypto.Util.Padding import pad
    except ImportError:
        raise Failure("SPORT_ENCODER_UNAVAILABLE", "本机缺少锻炼数据的加密依赖。")
    if not isinstance(secret, str) or len(secret) < 16:
        raise Failure(
            "SPORT_ENCODER_UNAVAILABLE", "体艺登录信息不完整，暂时不能编码锻炼数据。"
        )
    key = secret[:16].encode()
    cipher = AES.new(key, AES.MODE_CBC, b"1234567890123456")
    return base64.b64encode(cipher.encrypt(pad(raw.encode(), 16))).decode()


def _post(connection, endpoint, body):
    # The origin is fixed here; a caller-supplied base is never accepted.
    url = connection.checked_url("http://www.tyys.zju.edu.cn/cgapp-server/")
    if not url.endswith("/"):
        url += "/"
    url += "api/" + endpoint
    headers = connection.signed("/api/" + endpoint)
    headers.update(
        {
            "cgAuthorization": connection.session["token"],
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
            "app-key": "cgsoft",
        }
    )
    status, _, text = connection.fetch(url, headers, body, "POST")
    try:
        value = json.loads(text)
    except ValueError:
        raise Failure(
            "SPORT_RESPONSE_FORMAT",
            "学校返回的锻炼回执格式发生变化，本次没有当作成功。",
            status,
        )
    if not isinstance(value, dict):
        raise Failure(
            "SPORT_RESPONSE_FORMAT",
            "学校返回的锻炼回执格式发生变化，本次没有当作成功。",
            status,
        )
    return status, value


def read(connection, args):
    resource = args.get("resource")
    if resource == "sport_rules":
        profile = connection.resource({"resource": "profile"})[0]["data"]
        types = connection.api(
            "l/v6/sporttype",
            {"gender": str(profile.get("xb", "0")), "uid": connection.session["user"]},
        )
        invalid = connection.api("l/v6.1/sports/invalidconf")
        config = connection.api("l/v6/getConfig", {"uid": connection.session["user"]})
        sports_id = connection.api("l/v7/sportsId")
        return {
            "sportTypes": types,
            "invalidRules": invalid,
            "exerciseConfig": config,
            "sportsId": sports_id.get("data"),
            "officialSubmissionAvailable": connection.allow_sport_submit,
            "note": "规则和运动编号来自学校；提交能力取决于宿主是否授权并使用与官方客户端一致的编码组件。",
        }
    if resource == "sports_id":
        value = connection.api("l/v7/sportsId")
        return {"sportsId": value.get("data"), "response": value}
    if resource not in SUBMIT_PATHS:
        raise Failure("RESOURCE_NOT_FOUND", "没有这项体艺锻炼操作。")
    if not connection.allow_sport_submit:
        raise Failure("SPORT_SUBMIT_FORBIDDEN", "这次连接没有获得提交锻炼记录的授权。")
    payload = build_payload(connection, args)
    encoded = encode_value(
        payload, connection.sport_encoder, connection.session["secret"]
    )
    body = urllib.parse.urlencode({"jsonsports": encoded}).encode()
    status, value = _post(connection, SUBMIT_PATHS[resource], body)
    code = str(value.get("code"))
    accepted = code == "200"
    return {
        "recordRead": False,
        "personalRecordRead": False,
        "submissionAttempted": True,
        "submissionAccepted": accepted,
        "requestScope": {
            "kind": "official_exercise_" + resource,
            "encoder": connection.sport_encoder,
            "trackPoints": len(payload["coordinate"]),
            "odometer": payload["odometer"],
            "sportTypeId": payload["routeId"],
        },
        "response": value,
        "note": "学校回执原样返回；只有 code=200 才表示本次提交被接受。",
    }
