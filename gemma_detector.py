"""
Gemma-backed anomaly classification with deterministic fallback.

The fallback keeps the demo runnable on machines that do not have Ollama or
Gemma configured. Set USE_GEMMA=1 and OLLAMA_MODEL=gemma4:e4b to use Gemma.
"""

import hashlib
import json
import os
import sqlite3
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")
OLLAMA_BASE_URL = OLLAMA_URL.rsplit("/api/", 1)[0]   # e.g. http://localhost:11434
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma4:e4b")
OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "600"))


def check_ollama_connectivity() -> dict:
    """
    Returns a status dict with:
      - reachable: bool  (Ollama HTTP service is up)
      - model_available: bool  (configured model is listed)
      - models: list[str]   (all pulled models)
      - base_url: str
      - model: str
      - error: str | None
    """
    try:
        tags_url = f"{OLLAMA_BASE_URL}/api/tags"
        req = urllib.request.Request(tags_url)
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        models = [m["name"] for m in data.get("models", [])]
        available = any(
            m == OLLAMA_MODEL or m.split(":")[0] == OLLAMA_MODEL.split(":")[0]
            for m in models
        )
        return {
            "reachable": True,
            "model_available": available,
            "models": models,
            "base_url": OLLAMA_BASE_URL,
            "model": OLLAMA_MODEL,
            "error": None,
        }
    except Exception as exc:
        return {
            "reachable": False,
            "model_available": False,
            "models": [],
            "base_url": OLLAMA_BASE_URL,
            "model": OLLAMA_MODEL,
            "error": str(exc),
        }
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


def _resolve_model_name() -> str:
    """Find the actual model name in Ollama that matches our configured model."""
    try:
        tags_url = f"{OLLAMA_BASE_URL}/api/tags"
        req = urllib.request.Request(tags_url)
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        models = [m["name"] for m in data.get("models", [])]
        # Exact match first
        if OLLAMA_MODEL in models:
            return OLLAMA_MODEL
        # Prefix match (e.g. gemma4:e4b matches gemma4:e4b-mlx)
        base = OLLAMA_MODEL.split(":")[0]
        for m in models:
            if m.startswith(OLLAMA_MODEL) or m.split(":")[0] == base:
                return m
    except Exception:
        pass
    return OLLAMA_MODEL


def _call_gemma_json(prompt: str):
    cached = _get_cached_response(prompt)
    if cached is not None:
        return cached

    resolved_model = _resolve_model_name()
    payload = {
        "model": resolved_model,
        "prompt": prompt,
        "format": "json",
        "stream": False,
        "options": {"temperature": 0, "num_predict": 512},
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


def detect_anomalies(events: list[dict], use_gemma: bool = False) -> dict:
    if use_gemma:
        local_result = detect_anomalies_locally(events)
        candidates = _brief_candidates(local_result["findings"])
        source_summary = _source_summary(_compact_events(events))
        prompt = f"""
You are a cybersecurity anomaly detection engine.

Review candidate anomaly findings and decide which rules are valid.
Return ONLY valid JSON with this exact schema:
{{"is_incident":true,"accepted_rules":["AI-R1"],"summary":"short sentence"}}

Rules:
- accepted_rules must only contain rule values from the candidates.
- Accept a rule only if the event-count summary supports it.

Candidate findings:
{json.dumps(candidates, separators=(",", ":"))}

Event counts by source IP and event type:
{json.dumps(source_summary, separators=(",", ":"))}
"""
        try:
            result = _call_gemma_json(prompt)
            if "accepted_rules" in result:
                accepted = set(result.get("accepted_rules") or [])
                findings = [f for f in local_result["findings"] if f["rule"] in accepted]
                local_result["findings"] = findings
                local_result["summary"] = result.get("summary") or local_result["summary"]
                local_result["engine"] = "gemma"
                local_result["gemma_raw"] = result
                return local_result
            if "findings" in result and "iocs" in result:
                result["engine"] = "gemma"
                return result
            # Gemma responded but with unexpected format — still mark as gemma
            if isinstance(result, dict):
                local_result["summary"] = result.get("summary") or local_result["summary"]
                local_result["engine"] = "gemma"
                local_result["gemma_raw"] = result
                return local_result
            local_result["engine"] = "gemma"
            return local_result
        except (KeyError, json.JSONDecodeError, urllib.error.URLError, TimeoutError, OSError) as exc:
            import sys
            print(f"[gemma_detector] Gemma call failed: {exc}", file=sys.stderr)
            result = detect_anomalies_locally(events)
            result["engine"] = "local_fallback"
            result["gemma_error"] = str(exc)
            return result

    result = detect_anomalies_locally(events)
    result["engine"] = "local_fallback"
    return result


def _compact_events(events: list[dict]) -> list[dict]:
    compact = []
    for event in events:
        compact.append({
            "timestamp": event.get("timestamp"),
            "event_type": event.get("event_type"),
            "user_id": event.get("user_id"),
            "source_ip": event.get("source_ip"),
            "destination_ip": event.get("destination_ip"),
            "service": event.get("service"),
            "action": event.get("action"),
            "status": event.get("status"),
            "severity": event.get("severity"),
            "parser": event.get("parser"),
        })
    return compact


def _brief_candidates(findings: list[dict]) -> list[dict]:
    return [
        {
            "rule": f.get("rule"),
            "title": f.get("title"),
            "severity": f.get("severity"),
            "ip": f.get("ip"),
            "user": f.get("user"),
            "start": f.get("start"),
            "end": f.get("end"),
            "phase": f.get("phase"),
            "evidence_event_types": f.get("evidence_event_types"),
        }
        for f in findings
    ]


def _source_summary(events: list[dict]) -> dict:
    summary = defaultdict(Counter)
    for event in events:
        ip = event.get("source_ip") or "no_source_ip"
        summary[ip][event.get("event_type") or "unknown_event"] += 1
    return {ip: dict(counts) for ip, counts in summary.items()}


def detect_anomalies_locally(events: list[dict]) -> dict:
    findings = []
    iocs = {}
    by_ip = defaultdict(list)

    for event in events:
        ip = event.get("source_ip")
        if ip:
            by_ip[ip].append(event)

    for ip, ip_events in by_ip.items():
        failed = [e for e in ip_events if e.get("event_type") in {"ssh_failed_login", "login_failed", "http_auth_failure"}]
        successes = [e for e in ip_events if e.get("event_type") in {"ssh_success_login", "login_success"}]
        exports = [e for e in ip_events if e.get("event_type") in {"data_export", "http_data_access"}]
        denied = [e for e in ip_events if e.get("event_type") in {"firewall_deny", "access_blocked"}]
        aws_sensitive = [
            e for e in ip_events
            if e.get("event_type") in {"aws_createaccesskey", "aws_putbucketpolicy"}
        ]
        malware = [e for e in ip_events if e.get("event_type") == "malware_alert"]
        priv_esc = [e for e in ip_events if e.get("event_type") in {"privilege_escalation_attempt", "privilege_escalation"}]

        if len(failed) >= 5:
            findings.append(_finding(
                "AI-R1",
                "Authentication Brute-Force Pattern",
                "HIGH",
                0.86,
                ip,
                None,
                failed[0].get("timestamp"),
                failed[-1].get("timestamp"),
                "brute_force",
                f"{len(failed)} authentication failures observed from {ip}",
                failed,
            ))
            iocs[("ip", ip)] = "HIGH"

        if failed and successes:
            user = successes[0].get("user_id") or _mode_user(successes)
            findings.append(_finding(
                "AI-R2",
                "Likely Account Compromise After Failures",
                "CRITICAL",
                0.9,
                ip,
                user,
                successes[0].get("timestamp"),
                successes[0].get("timestamp"),
                "compromise",
                f"Successful authentication followed repeated failures from {ip}",
                [failed[-1], successes[0]],
            ))
            iocs[("ip", ip)] = "HIGH"
            if user:
                iocs[("compromised_account", user)] = "MEDIUM"

        if exports:
            export = exports[0]
            raw_obj = _parse_raw_json(export.get("raw_data"))
            bytes_sent = raw_obj.get("bytes_sent") or _extract_int(raw_obj, "bytes")
            detail = f"{bytes_sent} bytes exported" if bytes_sent else "Sensitive export-like access observed"
            findings.append(_finding(
                "AI-R3",
                "Potential Data Exfiltration",
                "CRITICAL",
                0.84,
                ip,
                export.get("user_id"),
                export.get("timestamp"),
                exports[-1].get("timestamp"),
                "exfiltration",
                f"{detail} from {ip}",
                exports,
            ))
            iocs[("ip", ip)] = "HIGH"

        if priv_esc:
            findings.append(_finding(
                "AI-R4",
                "Privilege Escalation Attempt",
                "HIGH",
                0.82,
                ip,
                _mode_user(priv_esc),
                priv_esc[0].get("timestamp"),
                priv_esc[-1].get("timestamp"),
                "privilege_escalation",
                f"Privilege escalation activity observed from {ip}",
                priv_esc,
            ))
            iocs[("ip", ip)] = "HIGH"

        if len(denied) >= 3:
            findings.append(_finding(
                "AI-R5",
                "Firewall Denial Burst",
                "MEDIUM",
                0.76,
                ip,
                None,
                denied[0].get("timestamp"),
                denied[-1].get("timestamp"),
                "network_probe",
                f"{len(denied)} denied firewall events from {ip}",
                denied,
            ))
            iocs[("ip", ip)] = "MEDIUM"

        if aws_sensitive:
            event_names = ", ".join(sorted({e.get("action") for e in aws_sensitive if e.get("action")}))
            findings.append(_finding(
                "AI-R6",
                "Sensitive Cloud Control Plane Activity",
                "HIGH",
                0.8,
                ip,
                _mode_user(aws_sensitive),
                aws_sensitive[0].get("timestamp"),
                aws_sensitive[-1].get("timestamp"),
                "cloud_persistence",
                f"Sensitive AWS actions observed: {event_names}",
                aws_sensitive,
            ))
            iocs[("ip", ip)] = "MEDIUM"

        if malware:
            findings.append(_finding(
                "AI-R7",
                "Endpoint Malware Alert",
                "CRITICAL",
                0.88,
                ip,
                _mode_user(malware),
                malware[0].get("timestamp"),
                malware[-1].get("timestamp"),
                "malware",
                "Malware-related endpoint log line detected",
                malware,
            ))
            iocs[("ip", ip)] = "HIGH"

    return {
        "findings": sorted(findings, key=lambda f: (_severity_rank(f["severity"]), f.get("start") or "")),
        "iocs": [
            {"ioc_type": ioc_type, "value": value, "confidence": confidence}
            for (ioc_type, value), confidence in sorted(iocs.items())
        ],
        "summary": "Anomalies were classified from normalized multi-source log events.",
    }


def _finding(rule, title, severity, confidence, ip, user, start, end, phase, description, evidence):
    return {
        "rule": rule,
        "title": title,
        "severity": severity,
        "confidence": confidence,
        "ip": ip,
        "user": user,
        "start": start,
        "end": end,
        "phase": phase,
        "description": description,
        "evidence_event_types": sorted({e.get("event_type", "unknown_event") for e in evidence}),
    }


def _mode_user(events):
    users = [e.get("user_id") for e in events if e.get("user_id")]
    if not users:
        return None
    return Counter(users).most_common(1)[0][0]


def _severity_rank(severity):
    return {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}.get(severity, 9)


def _parse_raw_json(raw):
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def _extract_int(obj, key):
    value = obj.get(key)
    if isinstance(value, int):
        return value
    return None


def timestamp_bounds(events: list[dict], *, source_ip: str | None = None, user_id: str | None = None):
    values = []
    for event in events:
        if source_ip and event.get("source_ip") != source_ip:
            continue
        if user_id and event.get("user_id") != user_id:
            continue
        ts = event.get("timestamp")
        if not ts:
            continue
        try:
            values.append(datetime.fromisoformat(ts))
        except ValueError:
            continue
    if not values:
        return None, None
    return min(values).isoformat(), max(values).isoformat()
