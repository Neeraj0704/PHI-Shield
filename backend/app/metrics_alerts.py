"""
Read redacted_logs.jsonl, compute metrics and alerts, write metrics.json and alerts.json.
Run periodically or at startup so GET /metrics and GET /alerts have data.
Pathway pipeline can do this in real time; this module is the fallback.
"""
import json
from collections import defaultdict
from datetime import datetime, timezone, timedelta

from app.config import REDACTED_LOGS_PATH, METRICS_PATH, ALERTS_PATH, DATA_DIR


def _parse_ts(ts: str):
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except Exception:
        return None


def _load_logs() -> list:
    if not REDACTED_LOGS_PATH.exists():
        return []
    logs = []
    with REDACTED_LOGS_PATH.open("r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                logs.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return logs


def compute_metrics(logs: list) -> dict:
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    day_24h_ago = now - timedelta(hours=24)

    by_day = defaultdict(int)
    by_user = defaultdict(int)
    risk_distribution = defaultdict(int)
    total_today = 0
    total_24h = 0
    active_investigations = 0  # HIGH/CRITICAL in last 24h

    for log in logs:
        ts = _parse_ts(log.get("timestamp") or "")
        if not ts:
            continue
        date_key = ts.strftime("%Y-%m-%d")
        by_day[date_key] += 1
        by_user[log.get("user_id") or "unknown"] += 1
        risk = (log.get("risk_severity") or "LOW").upper()
        risk_distribution[risk] += 1

        if ts >= today_start:
            total_today += 1
        if ts >= day_24h_ago:
            total_24h += 1
            if risk in ("HIGH", "CRITICAL"):
                active_investigations += 1

    # Sort by_day (last 7 days), by_user (top 10)
    sorted_days = sorted(by_day.items(), key=lambda x: x[0], reverse=True)[:7]
    sorted_users = sorted(by_user.items(), key=lambda x: -x[1])[:10]

    return {
        "total_today": total_today,
        "total_24h": total_24h,
        "active_investigations": active_investigations,
        "phi_views_24h": total_24h,
        "by_day": [{"date": d, "count": c} for d, c in sorted_days],
        "by_user": [{"user_id": u, "count": c} for u, c in sorted_users],
        "risk_distribution": dict(risk_distribution),
    }


def compute_alerts(logs: list) -> list:
    now = datetime.now(timezone.utc)
    hour_ago = now - timedelta(hours=1)
    alerts = []
    seen_high_risk = set()

    for log in logs:
        ts = _parse_ts(log.get("timestamp") or "")
        if not ts:
            continue
        risk = (log.get("risk_severity") or "LOW").upper()
        user_id = log.get("user_id") or "unknown"
        log_id = log.get("id") or ""

        # High/Critical risk in last 24h -> alert
        if risk in ("HIGH", "CRITICAL") and (now - ts).total_seconds() < 24 * 3600:
            key = (log_id, risk)
            if key not in seen_high_risk:
                seen_high_risk.add(key)
                severity_label = "High" if risk == "HIGH" else "Critical"
                alerts.append({
                    "id": f"alt_{log_id[:8]}",
                    "severity": risk.lower(),
                    "description": f"High-risk PHI access ({severity_label})",
                    "user_id": user_id,
                    "timestamp": log.get("timestamp"),
                    "log_id": log_id,
                    "type": "risk",
                })

    # Volume: user with >5 accesses in last hour
    user_counts_1h = defaultdict(int)
    for log in logs:
        ts = _parse_ts(log.get("timestamp") or "")
        if ts and ts >= hour_ago:
            user_counts_1h[log.get("user_id") or "unknown"] += 1
    for uid, cnt in user_counts_1h.items():
        if cnt >= 5:
            alerts.append({
                "id": f"alt_vol_{uid[:8]}",
                "severity": "medium",
                "description": f"Unusual volume of record access ({cnt} in last hour)",
                "user_id": uid,
                "timestamp": now.isoformat(),
                "log_id": None,
                "type": "volume",
            })

    # Sort by timestamp desc
    alerts.sort(key=lambda a: a.get("timestamp") or "", reverse=True)
    return alerts[:50]


def main():
    logs = _load_logs()
    metrics = compute_metrics(logs)
    alerts = compute_alerts(logs)

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with METRICS_PATH.open("w") as f:
        json.dump(metrics, f, indent=2)
    with ALERTS_PATH.open("w") as f:
        json.dump(alerts, f, indent=2)
    print(f"Wrote {METRICS_PATH} and {ALERTS_PATH}")


if __name__ == "__main__":
    main()
