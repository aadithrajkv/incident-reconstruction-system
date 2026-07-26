"""
reconstruct.py - Multi-Source Incident Reconstruction System

Pipeline:
  1. INGEST     - parse known logs and normalize unknown logs with Gemma/fallback
  2. NORMALIZE  - store all events in one SQLite schema
  3. DETECT     - Gemma 4 anomaly classification, with local fallback
  4. VISUALIZE  - terminal timeline, attack chain, IoCs
  5. REPORT     - Markdown incident triage report

To use Gemma through Ollama:
  USE_GEMMA=1 OLLAMA_MODEL=gemma4:e4b python reconstruct.py
"""

import concurrent.futures
import json
import os
import sqlite3
from collections import Counter
from datetime import datetime
from pathlib import Path

from gemma_detector import detect_anomalies, timestamp_bounds
from parsers import parse_log_source

try:
    from rich import box
    from rich.console import Console
    from rich.table import Table

    console = Console()
    RICH = True
except ImportError:
    RICH = False

    class _Console:
        def print(self, *args, **kwargs):
            print(*args)

    console = _Console()


DB_PATH = Path("db/incidents.db")
REPORT_PATH = Path("reports/incident_report.md")
USE_GEMMA = os.getenv("USE_GEMMA", "0").lower() in {"1", "true", "yes"}
USE_GEMMA_NORMALIZER = os.getenv("USE_GEMMA_NORMALIZER", "0").lower() in {"1", "true", "yes"}

LOG_SOURCES = [
    (Path("logs/auth.log"), "auth"),
    (Path("logs/app_events.jsonl"), "app_jsonl"),
    (Path("logs/nginx_access.log"), "nginx"),
    (Path("logs/firewall.log"), "firewall"),
    (Path("logs/cloudtrail.jsonl"), "cloudtrail"),
    (Path("logs/endpoint.log"), "generic"),
]


def init_db(conn):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS events (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp       TEXT,
            event_type      TEXT NOT NULL,
            user_id         TEXT,
            source_ip       TEXT,
            destination_ip  TEXT,
            hostname        TEXT,
            service         TEXT,
            action          TEXT,
            status          TEXT,
            severity        TEXT,
            raw_data        TEXT,
            parser          TEXT,
            normalized_by   TEXT,
            phase           TEXT DEFAULT 'unknown'
        );

        CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
        CREATE INDEX IF NOT EXISTS idx_events_source_ip ON events(source_ip);
        CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id);
        CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);

        CREATE TABLE IF NOT EXISTS iocs (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            ioc_type    TEXT,
            value       TEXT,
            confidence  TEXT,
            first_seen  TEXT,
            last_seen   TEXT
        );

        CREATE TABLE IF NOT EXISTS incidents (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            incident_id TEXT,
            title       TEXT,
            severity    TEXT,
            start_time  TEXT,
            end_time    TEXT,
            description TEXT
        );
    """)
    conn.commit()


def load_events(active_files=None):
    all_events = []
    counts = []
    
    # Dynamically find all log files in the logs/ folder to support custom uploads
    all_sources = []
    logs_dir = Path("logs")
    if logs_dir.exists():
        for path in logs_dir.glob("*"):
            if path.is_file() and path.suffix in {".log", ".jsonl", ".txt"}:
                name = path.name.lower()
                if "auth" in name:
                    log_type = "auth"
                elif "nginx" in name:
                    log_type = "nginx"
                elif "firewall" in name:
                    log_type = "firewall"
                elif "cloud" in name:
                    log_type = "cloudtrail"
                elif "app" in name:
                    log_type = "app_jsonl"
                elif "apache" in name:
                    log_type = "apache_error"
                elif "linux" in name or "syslog" in name:
                    log_type = "syslog"
                else:
                    log_type = "generic"
                all_sources.append((path, log_type))
    
    if not all_sources:
        all_sources = LOG_SOURCES

    # Filter based on user selection if active_files is provided
    if active_files is not None:
        all_sources = [
            (path, log_type) for path, log_type in all_sources
            if path.name in active_files
        ]
        
    with concurrent.futures.ThreadPoolExecutor() as executor:
        futures = {
            executor.submit(parse_log_source, path, log_type, USE_GEMMA_NORMALIZER): (path, log_type)
            for path, log_type in all_sources
        }
        for future in concurrent.futures.as_completed(futures):
            path, log_type = futures[future]
            try:
                events = future.result()
                all_events.extend(events)
                counts.append((path, log_type, len(events)))
            except Exception as e:
                print(f"Error parsing {path} ({log_type}): {e}")
                counts.append((path, log_type, 0))

    # Keep alphabetical order of count tuples based on filename
    counts.sort(key=lambda x: x[0].name)

    all_events.sort(key=lambda e: e.get("timestamp") or "")
    return all_events, counts


def ingest(conn, events):
    conn.executemany("""
        INSERT INTO events (
            timestamp, event_type, user_id, source_ip, destination_ip, hostname,
            service, action, status, severity, raw_data, parser, normalized_by
        )
        VALUES (
            :timestamp, :event_type, :user_id, :source_ip, :destination_ip, :hostname,
            :service, :action, :status, :severity, :raw_data, :parser, :normalized_by
        )
    """, events)
    conn.commit()


def load_events_from_db(conn):
    rows = conn.execute("""
        SELECT id, timestamp, event_type, user_id, source_ip, destination_ip,
               hostname, service, action, status, severity, raw_data, parser,
               normalized_by
        FROM events
        ORDER BY COALESCE(timestamp, '')
    """).fetchall()
    keys = [
        "id", "timestamp", "event_type", "user_id", "source_ip", "destination_ip",
        "hostname", "service", "action", "status", "severity", "raw_data",
        "parser", "normalized_by",
    ]
    return [dict(zip(keys, row)) for row in rows]


def apply_detection(conn, events, use_gemma: bool = False):
    result = detect_anomalies(events, use_gemma=use_gemma)
    findings = result["findings"]

    for finding in findings:
        phase = finding.get("phase") or "anomaly"
        ip = finding.get("ip")
        user = finding.get("user")
        evidence_types = finding.get("evidence_event_types") or []
        params = [phase]
        where = ["1=1"]

        if ip:
            where.append("source_ip=?")
            params.append(ip)
        if user:
            where.append("(user_id=? OR user_id IS NULL)")
            params.append(user)
        if evidence_types:
            placeholders = ",".join("?" for _ in evidence_types)
            where.append(f"event_type IN ({placeholders})")
            params.extend(evidence_types)

        conn.execute(f"UPDATE events SET phase=? WHERE {' AND '.join(where)}", params)

    for ioc in result["iocs"]:
        if ioc["ioc_type"] == "ip":
            first_seen, last_seen = timestamp_bounds(events, source_ip=ioc["value"])
        elif ioc["ioc_type"] == "compromised_account":
            first_seen, last_seen = timestamp_bounds(events, user_id=ioc["value"])
        else:
            first_seen, last_seen = timestamp_bounds(events)
        conn.execute("""
            INSERT INTO iocs (ioc_type, value, confidence, first_seen, last_seen)
            VALUES (?, ?, ?, ?, ?)
        """, (ioc["ioc_type"], ioc["value"], ioc["confidence"], first_seen, last_seen))

    if findings:
        incident_start = min((f.get("start") for f in findings if f.get("start")), default=None)
        incident_end = max((f.get("end") for f in findings if f.get("end")), default=None)
        top = sorted(findings, key=lambda f: _severity_rank(f["severity"]))[0]
        conn.execute("""
            INSERT INTO incidents (incident_id, title, severity, start_time, end_time, description)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            "INC-001",
            top["title"],
            top["severity"],
            incident_start,
            incident_end,
            result.get("summary", ""),
        ))

    conn.commit()
    return result


def visualize(conn, detection_result, source_counts):
    console.print("\n[bold white on blue]  Multi-Source Incident Reconstruction  [/bold white on blue]\n")
    console.print(f"Detection engine: [bold]{detection_result.get('engine', 'unknown')}[/bold]")

    console.print("\n[bold cyan]Log Sources[/bold cyan]")
    if RICH:
        t = Table(box=box.SIMPLE_HEAD, header_style="bold cyan")
        t.add_column("Source")
        t.add_column("Type")
        t.add_column("Events", justify="right")
        for path, log_type, count in source_counts:
            t.add_row(str(path), log_type, str(count))
        console.print(t)
    else:
        for path, log_type, count in source_counts:
            print(f"  {path:<28} {log_type:<12} {count}")

    rows = conn.execute("""
        SELECT timestamp, phase, event_type, user_id, source_ip, service, parser
        FROM events
        ORDER BY COALESCE(timestamp, '')
    """).fetchall()

    console.print("\n[bold cyan]Incident Timeline[/bold cyan]")
    total_events = len(rows)
    display_rows = rows
    if total_events > 30:
        display_rows = rows[:15] + [None] + rows[-15:]

    if RICH:
        t = Table(box=box.SIMPLE_HEAD, header_style="bold cyan")
        t.add_column("Time", width=19)
        t.add_column("Phase", width=20)
        t.add_column("Event", width=28)
        t.add_column("User", width=10)
        t.add_column("Source IP", width=16)
        t.add_column("Service", width=14)
        for row in display_rows:
            if row is None:
                t.add_row("...", f"[dim]truncated {total_events - 30} events[/dim]", "...", "...", "...", "...")
            else:
                ts, phase, event_type, user, ip, service, parser = row
                t.add_row(_short_ts(ts), phase, event_type, user or "-", ip or "-", service or parser or "-")
        console.print(t)
    else:
        for row in display_rows:
            if row is None:
                print(f"  ... truncated {total_events - 30} events ...")
            else:
                print("  ", row)

    console.print("\n[bold cyan]Findings[/bold cyan]")
    for finding in detection_result["findings"]:
        console.print(
            f"  [{finding['severity']}] {finding['title']} "
            f"({finding.get('confidence', 0):.2f}) - {finding['description']}"
        )

    iocs = conn.execute("SELECT ioc_type, value, confidence FROM iocs").fetchall()
    console.print("\n[bold cyan]IoCs[/bold cyan]")
    for ioc_type, value, confidence in iocs:
        console.print(f"  {ioc_type:<22} {value:<18} {confidence}")


def generate_report(conn, detection_result, source_counts):
    REPORT_PATH.parent.mkdir(exist_ok=True)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    events = conn.execute("""
        SELECT timestamp, phase, event_type, user_id, source_ip, destination_ip,
               service, parser, normalized_by
        FROM events
        ORDER BY COALESCE(timestamp, '')
    """).fetchall()
    iocs = conn.execute("SELECT ioc_type, value, confidence FROM iocs").fetchall()
    incidents = conn.execute("SELECT incident_id, title, severity, start_time, end_time FROM incidents").fetchall()

    findings = sorted(detection_result["findings"], key=lambda f: _severity_rank(f["severity"]))
    parser_counts = Counter(row[7] for row in events)

    lines = [
        "# Incident Triage Report",
        f"**Generated:** {now}",
        "**System:** Multi-Source Gemma-Aware Incident Reconstruction",
        f"**Detection engine:** `{detection_result.get('engine', 'unknown')}`",
        "",
        "---",
        "",
        "## Executive Summary",
        "",
        detection_result.get("summary", "Multi-source logs were normalized and analyzed for anomalies."),
        "",
    ]

    if incidents:
        lines += ["## Incident Record", "", "| ID | Title | Severity | Start | End |", "|----|-------|----------|-------|-----|"]
        for incident_id, title, severity, start, end in incidents:
            lines.append(f"| {incident_id} | {title} | {severity} | `{start or '-'}` | `{end or '-'}` |")
        lines.append("")

    lines += ["## Log Sources", "", "| Source | Type | Events |", "|--------|------|--------|"]
    for path, log_type, count in source_counts:
        lines.append(f"| `{path}` | {log_type} | {count} |")

    lines += ["", "## Normalizers", "", "| Parser | Events |", "|--------|--------|"]
    for parser, count in sorted(parser_counts.items()):
        lines.append(f"| {parser} | {count} |")

    lines += ["", "## Findings", ""]
    for finding in findings:
        lines += [
            f"### [{finding['severity']}] {finding['title']}",
            f"- **Rule:** `{finding['rule']}`",
            f"- **Confidence:** `{finding.get('confidence', 0):.2f}`",
            f"- **Phase:** `{finding.get('phase', 'anomaly')}`",
            f"- **Time:** `{(finding.get('start') or '-')[:19]}`",
            f"- **Description:** {finding['description']}",
            f"- **Evidence event types:** `{', '.join(finding.get('evidence_event_types') or [])}`",
            "",
        ]

    lines += [
        "---",
        "",
        "## Attack Timeline",
        "",
        "| Time | Phase | Event | User | Source IP | Destination IP | Service | Parser |",
        "|------|-------|-------|------|-----------|----------------|---------|--------|",
    ]
    for ts, phase, event_type, user, src, dst, service, parser, normalized_by in events:
        lines.append(
            f"| `{_short_ts(ts)}` | {phase} | {event_type} | {user or '-'} | "
            f"{src or '-'} | {dst or '-'} | {service or '-'} | {parser}/{normalized_by} |"
        )

    lines += [
        "",
        "---",
        "",
        "## Indicators of Compromise",
        "",
        "| Type | Value | Confidence |",
        "|------|-------|------------|",
    ]
    for ioc_type, value, confidence in iocs:
        lines.append(f"| {ioc_type} | `{value}` | {confidence} |")

    lines += [
        "",
        "---",
        "",
        "## Recommended Actions",
        "",
        "1. Block high-confidence malicious source IPs at the firewall and WAF.",
        "2. Reset credentials for any compromised or suspicious accounts.",
        "3. Review large export, backup, and cloud control-plane actions.",
        "4. Preserve all source logs and the SQLite database for forensic review.",
        "5. Run with `USE_GEMMA=1` against a local Gemma model for model-based classification.",
    ]

    REPORT_PATH.write_text("\n".join(lines))
    return REPORT_PATH


def _short_ts(ts):
    if not ts:
        return "-"
    return ts[11:19] if len(ts) >= 19 else ts


def _severity_rank(severity):
    return {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}.get(severity, 9)


def main():
    DB_PATH.parent.mkdir(exist_ok=True)
    DB_PATH.unlink(missing_ok=True)
    conn = sqlite3.connect(DB_PATH)
    init_db(conn)

    events, source_counts = load_events()
    ingest(conn, events)
    db_events = load_events_from_db(conn)
    detection_result = apply_detection(conn, db_events)
    visualize(conn, detection_result, source_counts)
    report_path = generate_report(conn, detection_result, source_counts)

    console.print(f"\n[green]Report written:[/green] [bold]{report_path}[/bold]")
    console.print(f"[green]Database written:[/green] [bold]{DB_PATH}[/bold]")
    conn.close()


if __name__ == "__main__":
    main()
