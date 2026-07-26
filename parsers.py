"""
Common log normalization for the incident reconstruction demo.

Known formats are parsed deterministically. Unknown/plain-text logs can be
normalized through Gemma when OLLAMA_MODEL is configured, with a conservative
local fallback for offline demos.
"""

import hashlib
import json
import os
import re
import sqlite3
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

YEAR = 2024
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma4:e4b")
OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "600"))


def base_event(
    *,
    timestamp=None,
    event_type="unknown_event",
    user_id=None,
    source_ip=None,
    destination_ip=None,
    hostname=None,
    service=None,
    action=None,
    status=None,
    severity=None,
    raw_data="",
    parser="unknown",
    normalized_by="parser",
):
    return {
        "timestamp": timestamp,
        "event_type": event_type,
        "user_id": user_id,
        "source_ip": source_ip,
        "destination_ip": destination_ip,
        "hostname": hostname,
        "service": service,
        "action": action,
        "status": status,
        "severity": severity,
        "raw_data": raw_data,
        "parser": parser,
        "normalized_by": normalized_by,
    }


def _safe_ts(value):
    if not value:
        return None
    return str(value).replace("Z", "")


AUTH_PATTERN = re.compile(r"(\w{3}\s+\d+\s[\d:]+)\s(\S+)\ssshd\[(\d+)\]:\s(.+)")
IP_PATTERN = re.compile(r"from (\d+\.\d+\.\d+\.\d+)")
USER_PATTERN = re.compile(r"for (\S+) from")
RHOST_PATTERN = re.compile(r"rhost=(\d+\.\d+\.\d+\.\d+)")
RHOST_ANY_PATTERN = re.compile(r"rhost=([A-Za-z0-9_.-]+)")


def parse_auth_log(path: Path) -> list[dict]:
    events = []
    if not path.exists():
        return events

    for line in path.read_text().splitlines():
        if "sshd[" not in line:
            continue
        m = AUTH_PATTERN.match(line)
        if not m:
            continue
        raw_ts, host, _pid, msg = m.groups()
        try:
            dt = datetime.strptime(f"{YEAR} {raw_ts.strip()}", "%Y %b %d %H:%M:%S")
        except ValueError:
            continue

        ip_m = IP_PATTERN.search(msg) or RHOST_PATTERN.search(msg)
        user_m = USER_PATTERN.search(msg)
        if not user_m and "user=" in msg:
            user_m = re.search(r"user=(\S+)", msg)

        if "Failed password" in msg:
            etype, action, status, severity = "ssh_failed_login", "login", "failure", "MEDIUM"
        elif "Accepted password" in msg:
            etype, action, status, severity = "ssh_success_login", "login", "success", "LOW"
        elif "session opened" in msg:
            etype, action, status, severity = "session_open", "session_open", "success", "LOW"
        elif "session closed" in msg:
            etype, action, status, severity = "session_close", "session_close", "success", "LOW"
        elif "authentication failure" in msg:
            etype, action, status, severity = "pam_auth_failure", "login", "failure", "MEDIUM"
        elif "Disconnected" in msg:
            etype, action, status, severity = "ssh_disconnect", "disconnect", None, "LOW"
        else:
            etype, action, status, severity = "sshd_misc", None, None, None

        events.append(base_event(
            timestamp=dt.isoformat(),
            event_type=etype,
            user_id=user_m.group(1) if user_m else None,
            source_ip=ip_m.group(1) if ip_m else None,
            hostname=host,
            service="ssh",
            action=action,
            status=status,
            severity=severity,
            raw_data=line.strip(),
            parser="auth",
        ))
    return events


SYSLOG_PATTERN = re.compile(
    r"(?P<ts>\w{3}\s+\d+\s[\d:]+)\s(?P<host>\S+)\s"
    r"(?P<service>[A-Za-z0-9_.-]+)(?:\((?P<facility>[^)]+)\))?"
    r"(?:\[(?P<pid>\d+)\])?:\s(?P<msg>.+)"
)


def parse_syslog(path: Path) -> list[dict]:
    events = []
    if not path.exists():
        return events

    for line in path.read_text(errors="ignore").splitlines():
        m = SYSLOG_PATTERN.match(line)
        if not m:
            continue
        d = m.groupdict()
        try:
            dt = datetime.strptime(f"{YEAR} {d['ts'].strip()}", "%Y %b %d %H:%M:%S")
        except ValueError:
            continue

        msg = d["msg"]
        lower = msg.lower()
        service = d["service"]
        source = IP_PATTERN.search(msg) or RHOST_ANY_PATTERN.search(msg)
        user_m = USER_PATTERN.search(msg)
        if not user_m:
            user_m = re.search(r"(?:user|account)=([A-Za-z0-9_.-]+)", msg)
        if not user_m and "for user " in msg:
            user_m = re.search(r"for user ([A-Za-z0-9_.-]+)", msg)

        if service == "sshd" and "authentication failure" in lower:
            etype, action, status, severity = "login_failed", "login", "failure", "MEDIUM"
        elif service == "sshd" and "check pass" in lower:
            etype, action, status, severity = "ssh_login_probe", "login_probe", None, "LOW"
        elif "session opened" in lower:
            etype, action, status, severity = "session_open", "session_open", "success", "LOW"
        elif "session closed" in lower:
            etype, action, status, severity = "session_close", "session_close", "success", "LOW"
        elif "alert" in lower:
            etype, action, status, severity = "system_alert", "alert", None, "HIGH"
        elif "fail" in lower or "error" in lower or "invalid" in lower:
            etype, action, status, severity = "system_error", "error", "failure", "MEDIUM"
        else:
            etype, action, status, severity = "system_event", None, None, "LOW"

        events.append(base_event(
            timestamp=dt.isoformat(),
            event_type=etype,
            user_id=user_m.group(1) if user_m else None,
            source_ip=source.group(1) if source else None,
            hostname=d["host"],
            service=service,
            action=action,
            status=status,
            severity=severity,
            raw_data=line.strip(),
            parser="syslog",
        ))
    return events


APACHE_ERROR_PATTERN = re.compile(
    r"\[(?P<ts>\w{3}\s\w{3}\s+\d+\s[\d:]+\s\d{4})\]\s"
    r"\[(?P<level>[^\]]+)\]\s(?P<msg>.*)"
)
APACHE_CLIENT_PATTERN = re.compile(r"\[client (?P<client>[^\]]+)\]")


def parse_apache_error_log(path: Path) -> list[dict]:
    events = []
    if not path.exists():
        return events

    for line in path.read_text(errors="ignore").splitlines():
        m = APACHE_ERROR_PATTERN.match(line)
        if not m:
            continue
        d = m.groupdict()
        try:
            dt = datetime.strptime(d["ts"], "%a %b %d %H:%M:%S %Y")
        except ValueError:
            continue

        level = d["level"].lower()
        msg = d["msg"]
        client = APACHE_CLIENT_PATTERN.search(msg)
        if client:
            etype = "apache_client_error"
        elif level in {"error", "crit", "alert", "emerg"}:
            etype = "apache_error"
        elif level in {"warn", "warning"}:
            etype = "apache_warning"
        else:
            etype = "apache_notice"

        events.append(base_event(
            timestamp=dt.isoformat(),
            event_type=etype,
            source_ip=client.group("client") if client else None,
            hostname="apache",
            service="apache",
            action=msg,
            status=level,
            severity="HIGH" if etype == "apache_client_error" else "MEDIUM" if level == "error" else "LOW",
            raw_data=line.strip(),
            parser="apache_error",
        ))
    return events


def parse_app_jsonl(path: Path) -> list[dict]:
    events = []
    if not path.exists():
        return events

    for line in path.read_text().splitlines():
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        etype = obj.get("event_type", "app_event")
        status_code = obj.get("status_code")
        status = "success" if isinstance(status_code, int) and status_code < 400 else None
        events.append(base_event(
            timestamp=_safe_ts(obj.get("timestamp")),
            event_type=etype,
            user_id=obj.get("user_id"),
            source_ip=obj.get("source_ip"),
            hostname=obj.get("hostname", "app-server"),
            service="application",
            action=obj.get("method") or obj.get("action"),
            status=status,
            severity="HIGH" if etype in {"data_export", "privilege_escalation_attempt"} else "LOW",
            raw_data=line.strip(),
            parser="app_jsonl",
        ))
    return events


NGINX_PATTERN = re.compile(
    r'(?P<ip>\d+\.\d+\.\d+\.\d+) - (?P<user>\S+) '
    r'\[(?P<ts>[^\]]+)\] "(?P<method>\S+) (?P<path>\S+) (?P<proto>[^"]+)" '
    r'(?P<status>\d+) (?P<bytes>\d+)'
)


def parse_nginx_access(path: Path) -> list[dict]:
    events = []
    if not path.exists():
        return events

    for line in path.read_text().splitlines():
        m = NGINX_PATTERN.match(line)
        if not m:
            continue
        d = m.groupdict()
        try:
            dt = datetime.strptime(d["ts"].split()[0], "%d/%b/%Y:%H:%M:%S")
        except ValueError:
            continue
        status_code = int(d["status"])
        request_path = d["path"]
        if status_code in {401, 403}:
            etype = "http_auth_failure"
        elif "export" in request_path or "backup" in request_path:
            etype = "http_data_access"
        elif status_code >= 500:
            etype = "http_server_error"
        else:
            etype = "http_request"

        events.append(base_event(
            timestamp=dt.isoformat(),
            event_type=etype,
            user_id=None if d["user"] == "-" else d["user"],
            source_ip=d["ip"],
            hostname="web-server",
            service="http",
            action=f'{d["method"]} {request_path}',
            status=str(status_code),
            severity="MEDIUM" if status_code >= 400 else "LOW",
            raw_data=line.strip(),
            parser="nginx",
        ))
    return events


FIREWALL_PATTERN = re.compile(
    r"(?P<ts>\S+)\s+(?P<host>\S+)\s+firewall:\s+"
    r"action=(?P<action>\S+)\s+src=(?P<src>\S+)\s+dst=(?P<dst>\S+)\s+"
    r"proto=(?P<proto>\S+)\s+dpt=(?P<dpt>\S+)"
)


def parse_firewall(path: Path) -> list[dict]:
    events = []
    if not path.exists():
        return events

    for line in path.read_text().splitlines():
        if "firewall:" not in line:
            continue
        m = FIREWALL_PATTERN.match(line)
        if not m:
            continue
        d = m.groupdict()
        events.append(base_event(
            timestamp=_safe_ts(d["ts"]),
            event_type="firewall_deny" if d["action"].upper() == "DENY" else "firewall_allow",
            source_ip=d["src"],
            destination_ip=d["dst"],
            hostname=d["host"],
            service=f'{d["proto"].lower()}/{d["dpt"]}',
            action=d["action"].lower(),
            status="blocked" if d["action"].upper() == "DENY" else "allowed",
            severity="MEDIUM" if d["action"].upper() == "DENY" else "LOW",
            raw_data=line.strip(),
            parser="firewall",
        ))
    return events


def parse_cloudtrail_jsonl(path: Path) -> list[dict]:
    events = []
    if not path.exists():
        return events

    for line in path.read_text().splitlines():
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        event_name = obj.get("eventName", "CloudTrailEvent")
        user = obj.get("userIdentity", {}).get("userName")
        src_ip = obj.get("sourceIPAddress")
        error_code = obj.get("errorCode")
        events.append(base_event(
            timestamp=_safe_ts(obj.get("eventTime")),
            event_type=f'aws_{event_name.lower()}',
            user_id=user,
            source_ip=src_ip,
            hostname=obj.get("awsRegion"),
            service=obj.get("eventSource", "aws"),
            action=event_name,
            status="failure" if error_code else "success",
            severity="HIGH" if event_name in {"CreateAccessKey", "PutBucketPolicy"} else "LOW",
            raw_data=line.strip(),
            parser="cloudtrail",
        ))
    return events


CACHE_DB_PATH = Path("db/incidents.db")


def _get_cached_response(prompt: str) -> dict | None:
    if not CACHE_DB_PATH.parent.exists():
        CACHE_DB_PATH.parent.mkdir(exist_ok=True)
    conn = sqlite3.connect(CACHE_DB_PATH)
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS llm_cache (
                prompt_hash TEXT PRIMARY KEY,
                prompt      TEXT,
                response    TEXT,
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
        
        prompt_hash = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
        row = conn.execute("SELECT response FROM llm_cache WHERE prompt_hash = ?", (prompt_hash,)).fetchone()
        if row:
            return json.loads(row[0])
    except Exception:
        pass
    finally:
        conn.close()
    return None


def _save_cached_response(prompt: str, response_obj: dict):
    conn = sqlite3.connect(CACHE_DB_PATH)
    try:
        prompt_hash = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
        conn.execute(
            "INSERT OR REPLACE INTO llm_cache (prompt_hash, prompt, response) VALUES (?, ?, ?)",
            (prompt_hash, prompt, json.dumps(response_obj))
        )
        conn.commit()
    except Exception:
        pass
    finally:
        conn.close()


def _call_gemma_json(prompt: str):
    cached = _get_cached_response(prompt)
    if cached is not None:
        return cached

    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "format": "json",
        "stream": False,
        "options": {"temperature": 0, "num_predict": 1024},
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(OLLAMA_URL, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=OLLAMA_TIMEOUT) as response:
        outer = json.loads(response.read().decode("utf-8"))
    
    try:
        res = json.loads(outer["response"])
    except json.JSONDecodeError:
        res = {"_raw_response": outer.get("response", "")}
        
    _save_cached_response(prompt, res)
    return res


def normalize_unknown_with_gemma(path: Path, use_gemma: bool = True) -> list[dict]:
    if not path.exists():
        return []
    raw_lines = [line.strip() for line in path.read_text().splitlines() if line.strip()]
    if not raw_lines:
        return []

    if use_gemma:
        prompt = f"""
You are a log normalization engine.

Convert raw logs into JSON events. Return ONLY valid JSON with this schema:
{{"events":[{{"timestamp": string|null, "event_type": string, "user_id": string|null,
"source_ip": string|null, "destination_ip": string|null, "hostname": string|null,
"service": string|null, "action": string|null, "status": string|null,
"severity": string|null, "raw_data": string}}]}}

Rules:
- Do not invent missing values.
- Use null when a field is absent.
- Preserve raw_data exactly.
- Prefer event_type names like login_failed, login_success, http_request,
  firewall_deny, data_export, privilege_escalation, malware_alert.

Raw logs:
{json.dumps(raw_lines, indent=2)}
"""
        try:
            result = _call_gemma_json(prompt)
            events = result["events"] if isinstance(result, dict) else result
            return [
                base_event(
                    timestamp=_safe_ts(e.get("timestamp")),
                    event_type=e.get("event_type", "unknown_event"),
                    user_id=e.get("user_id"),
                    source_ip=e.get("source_ip"),
                    destination_ip=e.get("destination_ip"),
                    hostname=e.get("hostname"),
                    service=e.get("service"),
                    action=e.get("action"),
                    status=e.get("status"),
                    severity=e.get("severity"),
                    raw_data=e.get("raw_data", ""),
                    parser="generic_gemma",
                    normalized_by="gemma",
                )
                for e in events
                if isinstance(e, dict)
            ]
        except (KeyError, json.JSONDecodeError, urllib.error.URLError, TimeoutError, OSError):
            pass

    return normalize_unknown_locally(raw_lines)


def normalize_unknown_locally(raw_lines: list[str]) -> list[dict]:
    events = []
    ip_re = re.compile(r"\b\d+\.\d+\.\d+\.\d+\b")
    ts_re = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}")
    user_re = re.compile(r"(?:user|account)=([A-Za-z0-9_.-]+)")

    for line in raw_lines:
        lower = line.lower()
        ips = ip_re.findall(line)
        ts = ts_re.search(line)
        user = user_re.search(line)
        if "malware" in lower or "ransom" in lower:
            etype, severity = "malware_alert", "CRITICAL"
        elif "export" in lower or "download" in lower:
            etype, severity = "data_export", "HIGH"
        elif "denied" in lower or "blocked" in lower:
            etype, severity = "access_blocked", "MEDIUM"
        elif "failed" in lower:
            etype, severity = "login_failed", "MEDIUM"
        else:
            etype, severity = "unknown_event", None

        events.append(base_event(
            timestamp=ts.group(0) if ts else None,
            event_type=etype,
            user_id=user.group(1) if user else None,
            source_ip=ips[0] if ips else None,
            destination_ip=ips[1] if len(ips) > 1 else None,
            service="unknown",
            action=etype,
            severity=severity,
            raw_data=line,
            parser="generic_local",
            normalized_by="local_fallback",
        ))
    return events


def parse_log_source(path: Path, log_type: str, use_gemma: bool = True) -> list[dict]:
    parsers = {
        "auth": parse_auth_log,
        "syslog": parse_syslog,
        "apache_error": parse_apache_error_log,
        "app_jsonl": parse_app_jsonl,
        "nginx": parse_nginx_access,
        "firewall": parse_firewall,
        "cloudtrail": parse_cloudtrail_jsonl,
    }
    if log_type == "generic":
        return normalize_unknown_with_gemma(path, use_gemma=use_gemma)
    return parsers[log_type](path)
