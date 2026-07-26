"""
regex_detector.py - Dynamic Regular Expression Anomaly Detection Engine

Allows defining, running, and testing regex-based patterns on logs to identify
anomalies on the fly. Fits directly with the incident reconstruction findings schema.
"""

import re
from collections import Counter, defaultdict

# Default regex rules that mirror key attack characteristics
DEFAULT_REGEX_RULES = [
    {
        "id": "REG-R1",
        "name": "SSH Brute-Force",
        "pattern": r"(Failed password|authentication failure)",
        "field": "raw_data",
        "severity": "HIGH",
        "confidence": 0.85,
        "phase": "brute_force",
        "description": "Repeated failed authentication attempts detected via SSH or PAM logs."
    },
    {
        "id": "REG-R2",
        "name": "Suspicious Sudo or Privilege Escalation",
        "pattern": r"(sudo -l|privilege_escalation_attempt|privilege_escalation)",
        "field": "raw_data",
        "severity": "HIGH",
        "confidence": 0.90,
        "phase": "privilege_escalation",
        "description": "Attempt to inspect sudo privileges or execute privilege escalation commands."
    },
    {
        "id": "REG-R3",
        "name": "Data Export or Exfiltration Indicator",
        "pattern": r"(/api/records/export|data_export|export_format)",
        "field": "raw_data",
        "severity": "CRITICAL",
        "confidence": 0.95,
        "phase": "exfiltration",
        "description": "Requests to data export endpoints or explicit data export events indicating potential data theft."
    },
    {
        "id": "REG-R4",
        "name": "Malware Activity Alert",
        "pattern": r"(malware|virus|trojan|SuspiciousSudoProbe)",
        "field": "raw_data",
        "severity": "CRITICAL",
        "confidence": 0.88,
        "phase": "malware",
        "description": "Endpoint alert or raw event mentioning malware activity signatures."
    },
    {
        "id": "REG-R5",
        "name": "Firewall Block Pattern",
        "pattern": r"action=DENY",
        "field": "raw_data",
        "severity": "MEDIUM",
        "confidence": 0.70,
        "phase": "network_probe",
        "description": "Firewall DENY rule triggered, indicating reconnaissance or brute-forcing activity."
    },
    {
        "id": "REG-R6",
        "name": "Cloud Persistence Action",
        "pattern": r"(CreateAccessKey|PutBucketPolicy)",
        "field": "raw_data",
        "severity": "HIGH",
        "confidence": 0.80,
        "phase": "cloud_persistence",
        "description": "AWS API calls creating backdoors or modifying bucket access controls."
    }
]


def test_regex_rule(events: list[dict], pattern: str, field: str = "raw_data") -> list[dict]:
    """
    Tests a single regex pattern on events on the fly, returning all matching events.
    """
    matches = []
    try:
        regex = re.compile(pattern, re.IGNORECASE)
    except re.error:
        # Invalid regex input
        return []

    for event in events:
        val = event.get(field) or ""
        # If the field is raw_data, make sure we use the string representation
        if not isinstance(val, str):
            val = str(val)
        if regex.search(val):
            matches.append(event)
    return matches


def run_regex_detection(events: list[dict], custom_rules: list[dict] = None) -> dict:
    """
    Runs dynamic regex rules against the events.
    Returns findings, IOCs, and a summary.
    """
    rules = custom_rules if custom_rules is not None else DEFAULT_REGEX_RULES
    findings = []
    iocs = {}
    
    # Track event counts matching rules per IP
    by_ip = defaultdict(list)
    for event in events:
        ip = event.get("source_ip")
        if ip:
            by_ip[ip].append(event)
            
    for rule in rules:
        try:
            regex = re.compile(rule["pattern"], re.IGNORECASE)
        except re.error:
            continue

        field = rule.get("field", "raw_data")
        severity = rule.get("severity", "MEDIUM")
        confidence = float(rule.get("confidence", 0.7))
        phase = rule.get("phase", "anomaly")
        
        # Check rule match group by IP
        for ip, ip_events in by_ip.items():
            matched_events = []
            for event in ip_events:
                val = event.get(field) or ""
                if not isinstance(val, str):
                    val = str(val)
                if regex.search(val):
                    matched_events.append(event)
                    
            if matched_events:
                # If it's a brute force or firewall burst rule, we might require a count threshold
                if rule["id"] == "REG-R1" and len(matched_events) < 5:
                    continue  # Brute force needs at least 5 failures
                if rule["id"] == "REG-R5" and len(matched_events) < 3:
                    continue  # Firewall probe needs at least 3 blocks
                
                # Sort matching events by timestamp
                matched_events.sort(key=lambda e: e.get("timestamp") or "")
                
                # Determine user (most frequent user in matched events)
                users = [e.get("user_id") for e in matched_events if e.get("user_id")]
                user = Counter(users).most_common(1)[0][0] if users else None
                
                evidence_types = sorted(list({e.get("event_type", "unknown_event") for e in matched_events}))
                
                findings.append({
                    "rule": rule["id"],
                    "title": rule["name"],
                    "severity": severity,
                    "confidence": confidence,
                    "ip": ip,
                    "user": user,
                    "start": matched_events[0].get("timestamp"),
                    "end": matched_events[-1].get("timestamp"),
                    "phase": phase,
                    "description": f"{rule['description']} (Matched {len(matched_events)} events from IP {ip})",
                    "evidence_event_types": evidence_types
                })
                
                # Populate IoCs
                iocs[("ip", ip)] = "HIGH" if severity in ("CRITICAL", "HIGH") else "MEDIUM"
                if user:
                    iocs[("compromised_account", user)] = "MEDIUM"

    # Sort findings by severity rank
    def _severity_rank(sev):
        return {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}.get(sev, 9)

    findings.sort(key=lambda f: (_severity_rank(f["severity"]), f.get("start") or ""))

    formatted_iocs = [
        {"ioc_type": ioc_type, "value": val, "confidence": conf}
        for (ioc_type, val), conf in sorted(iocs.items())
    ]

    return {
        "findings": findings,
        "iocs": formatted_iocs,
        "summary": f"Analyzed {len(events)} events using {len(rules)} regex-based anomaly rules."
    }


def suggest_regex_rules(events: list[dict]) -> list[dict]:
    """
    Analyzes logs and dynamically suggests regular expression queries based on
    outliers, frequencies, or patterns.
    """
    suggestions = []
    
    # 1. Look for high failure occurrences
    fail_keywords = ["failed", "denied", "blocked", "failure", "invalid", "unauthorized"]
    fail_counts = Counter()
    for event in events:
        raw = (event.get("raw_data") or "").lower()
        for kw in fail_keywords:
            if kw in raw:
                fail_counts[kw] += 1
                
    for kw, count in fail_counts.most_common(3):
        if count >= 3:
            suggestions.append({
                "id": f"SUG-FAIL-{kw.upper()}",
                "name": f"Frequent {kw.capitalize()} Event Detector",
                "pattern": rf"\b{kw}\b",
                "field": "raw_data",
                "severity": "HIGH" if kw in ("unauthorized", "invalid") else "MEDIUM",
                "confidence": 0.8,
                "phase": "recon" if kw == "denied" else "brute_force",
                "description": f"Detects occurrences of security failure keyword '{kw}' (observed {count} times)."
            })
            
    # 2. Look for large data volumes
    for event in events:
        if event.get("event_type") == "data_export" or "export" in (event.get("raw_data") or "").lower():
            suggestions.append({
                "id": "SUG-EXFIL",
                "name": "Data Export Pattern Detector",
                "pattern": r"(export|backup|download|bytes_sent)",
                "field": "raw_data",
                "severity": "CRITICAL",
                "confidence": 0.9,
                "phase": "exfiltration",
                "description": "Detects possible sensitive file downloads, backups, or exports."
            })
            break
            
    # 3. Look for cloud activity
    for event in events:
        if event.get("parser") == "cloudtrail":
            suggestions.append({
                "id": "SUG-CLOUD",
                "name": "Cloud Control-Plane Changes",
                "pattern": r"(Create|Put|Delete|Modify|Attach)",
                "field": "raw_data",
                "severity": "HIGH",
                "confidence": 0.85,
                "phase": "cloud_persistence",
                "description": "Detects modifying API calls on cloud resources."
            })
            break

    # Add default rules if suggestions are sparse
    if len(suggestions) < 3:
        suggestions.extend(DEFAULT_REGEX_RULES[:3])
        
    return suggestions
