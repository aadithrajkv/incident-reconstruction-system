"""
analyse.py — Post-Incident Data Analysis
─────────────────────────────────────────
Queries the SQLite database created by reconstruct.py and produces
forensic statistics: event distributions, attack timing, brute-force
rate metrics, target enumeration patterns, and exfiltration details.

Run after reconstruct.py:
    python analyse.py
"""

import json
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

DB_PATH = Path("db/incidents.db")

# ── Rich setup (graceful fallback) ───────────────────────────────────────────
try:
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel
    from rich.columns import Columns
    from rich import box
    console = Console()
    RICH = True
except ImportError:
    RICH = False
    class _FakeConsole:
        def print(self, *a, **kw): print(*a)
    console = _FakeConsole()

def stat_card(label, value, color="white"):
    return Panel(
        f"[bold {color}]{value}[/bold {color}]",
        title=f"[dim]{label}[/dim]",
        border_style="dim",
        width=24,
        padding=(0, 1),
    )

# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    if not DB_PATH.exists():
        print("Error: db/incidents.db not found. Run reconstruct.py first.")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)

    console.print("\n[bold white on blue]  Post-Incident Data Analysis  [/bold white on blue]\n")

    # ── 1. Overview cards ────────────────────────────────────────────────
    total    = conn.execute("SELECT COUNT(*) FROM events").fetchone()[0]
    ips      = conn.execute("SELECT COUNT(DISTINCT source_ip) FROM events WHERE source_ip IS NOT NULL").fetchone()[0]
    users    = conn.execute("SELECT COUNT(DISTINCT user_id) FROM events WHERE user_id IS NOT NULL").fetchone()[0]
    ioc_cnt  = conn.execute("SELECT COUNT(*) FROM iocs").fetchone()[0]

    if RICH:
        console.print(Columns([
            stat_card("Total Events", str(total), "cyan"),
            stat_card("Unique IPs", str(ips), "yellow"),
            stat_card("Unique Users", str(users), "green"),
            stat_card("IoCs Extracted", str(ioc_cnt), "red"),
        ], padding=(0, 1)))
    else:
        print(f"  Events: {total}  |  IPs: {ips}  |  Users: {users}  |  IoCs: {ioc_cnt}")

    # ── 2. Event type distribution ───────────────────────────────────────
    console.print("\n[bold cyan]── Event Type Distribution ──[/bold cyan]\n")
    evt_rows = conn.execute(
        "SELECT event_type, COUNT(*) cnt FROM events GROUP BY event_type ORDER BY cnt DESC"
    ).fetchall()

    if RICH:
        t = Table(box=box.SIMPLE_HEAD, header_style="bold cyan", padding=(0, 2))
        t.add_column("Event Type", width=35)
        t.add_column("Count", justify="right", width=8)
        t.add_column("", width=30)
        mx = max(r[1] for r in evt_rows)
        for etype, cnt in evt_rows:
            blen = int((cnt / mx) * 25)
            c = ("red" if "fail" in etype else
                 "yellow" if "api" in etype else
                 "magenta" if "export" in etype else
                 "green" if "success" in etype else "cyan")
            bar = f"[{c}]{'█' * blen}{'░' * (25 - blen)}[/{c}]"
            t.add_row(etype, str(cnt), bar)
        console.print(t)
    else:
        for etype, cnt in evt_rows:
            print(f"  {etype:<35} {cnt}")

    # ── 3. Phase classification ──────────────────────────────────────────
    console.print("\n[bold cyan]── Attack Phase Classification ──[/bold cyan]\n")
    phase_rows = conn.execute(
        "SELECT phase, COUNT(*) FROM events GROUP BY phase ORDER BY COUNT(*) DESC"
    ).fetchall()

    icons = {"unknown": "·", "recon": "🔍", "compromise": "🔓",
             "exfiltration": "📤", "privilege_escalation": "⬆ "}
    sev = {"unknown": "[dim]LOW[/dim]", "recon": "[yellow]MEDIUM[/yellow]",
           "compromise": "[bold red]CRITICAL[/bold red]",
           "exfiltration": "[bold magenta]CRITICAL[/bold magenta]",
           "privilege_escalation": "[bold orange3]HIGH[/bold orange3]"}

    if RICH:
        t2 = Table(box=box.SIMPLE_HEAD, header_style="bold cyan", padding=(0, 2))
        t2.add_column("Phase", width=25)
        t2.add_column("Events", justify="right", width=8)
        t2.add_column("Severity", width=15)
        for phase, cnt in phase_rows:
            t2.add_row(f"{icons.get(phase,'·')} {phase.replace('_',' ').upper()}",
                       str(cnt), sev.get(phase, "—"))
        console.print(t2)
    else:
        for phase, cnt in phase_rows:
            print(f"  {phase:<25} {cnt}")

    # ── 4. Timeline analysis ─────────────────────────────────────────────
    console.print("\n[bold cyan]── Attack Timeline ──[/bold cyan]\n")
    attacker_ip = "203.0.113.47"
    first = conn.execute(
        "SELECT MIN(timestamp) FROM events WHERE source_ip=?", (attacker_ip,)
    ).fetchone()[0]
    last = conn.execute(
        "SELECT MAX(timestamp) FROM events WHERE source_ip=?", (attacker_ip,)
    ).fetchone()[0]
    comp = conn.execute(
        "SELECT timestamp FROM events WHERE phase='compromise' LIMIT 1"
    ).fetchone()
    exfil = conn.execute(
        "SELECT timestamp FROM events WHERE phase='exfiltration' LIMIT 1"
    ).fetchone()

    fa = datetime.fromisoformat(first)
    la = datetime.fromisoformat(last)
    dur = (la - fa).total_seconds()

    console.print(f"  First malicious event:  [bold]{first[11:19]}[/bold]")
    console.print(f"  Last malicious event:   [bold]{last[11:19]}[/bold]")
    console.print(f"  Total attack duration:  [bold]{int(dur // 60)} min {int(dur % 60)} sec[/bold]")

    if comp:
        ct = datetime.fromisoformat(comp[0])
        bf_dur = (ct - fa).total_seconds()
        console.print(f"  Time to compromise:     {int(bf_dur // 60)} min {int(bf_dur % 60)} sec [dim](brute-force duration)[/dim]")
    if exfil and comp:
        et = datetime.fromisoformat(exfil[0])
        dwell = (et - ct).total_seconds()
        console.print(f"  Compromise → exfil:     [bold red]{int(dwell // 60)} min {int(dwell % 60)} sec[/bold red] [dim](dwell time)[/dim]")

    # ── 5. Brute-force rate ──────────────────────────────────────────────
    console.print("\n[bold cyan]── Brute-Force Rate Analysis ──[/bold cyan]\n")
    fail_rows = conn.execute(
        "SELECT timestamp FROM events "
        "WHERE event_type='ssh_failed_login' AND source_ip=? ORDER BY timestamp",
        (attacker_ip,)
    ).fetchall()
    times = [datetime.fromisoformat(r[0]) for r in fail_rows]
    intervals = [(times[i+1] - times[i]).total_seconds() for i in range(len(times)-1)]
    avg_i = sum(intervals) / len(intervals)
    rate = 60 / avg_i if avg_i > 0 else 0

    if RICH:
        t3 = Table(box=box.SIMPLE_HEAD, header_style="bold cyan", padding=(0, 2))
        t3.add_column("Metric", width=32)
        t3.add_column("Value", justify="right", width=18)
        t3.add_row("Total failed attempts", f"[bold]{len(times)}[/bold]")
        t3.add_row("Avg interval", f"{avg_i:.1f} sec")
        t3.add_row("Min interval", f"{min(intervals):.1f} sec")
        t3.add_row("Max interval", f"{max(intervals):.1f} sec")
        t3.add_row("Attack rate", f"[bold red]{rate:.1f} attempts/min[/bold red]")
        console.print(t3)
    else:
        print(f"  {len(times)} attempts | avg {avg_i:.1f}s | rate {rate:.1f}/min")

    # ── 6. Target enumeration ────────────────────────────────────────────
    console.print("\n[bold cyan]── Target User Enumeration ──[/bold cyan]\n")
    tgt_rows = conn.execute(
        "SELECT user_id, COUNT(*) cnt FROM events "
        "WHERE event_type='ssh_failed_login' AND source_ip=? "
        "GROUP BY user_id ORDER BY cnt DESC",
        (attacker_ip,)
    ).fetchall()

    if RICH:
        t4 = Table(box=box.SIMPLE_HEAD, header_style="bold cyan", padding=(0, 2))
        t4.add_column("Target User", width=15)
        t4.add_column("Attempts", justify="right", width=10)
        t4.add_column("Strategy", width=40)
        for user, cnt in tgt_rows:
            strat = ("[bold red]PRIMARY TARGET — dictionary attack[/bold red]" if cnt > 10
                     else "[yellow]Username enumeration probe[/yellow]")
            t4.add_row(user, str(cnt), strat)
        console.print(t4)
    else:
        for user, cnt in tgt_rows:
            print(f"  {user:<15} {cnt}")

    # ── 7. Exfiltration details ──────────────────────────────────────────
    console.print("\n[bold cyan]── Exfiltration Forensics ──[/bold cyan]\n")
    exp_raw = conn.execute(
        "SELECT raw_data FROM events WHERE event_type='data_export' LIMIT 1"
    ).fetchone()
    if exp_raw:
        obj = json.loads(exp_raw[0])
        bs = obj.get("bytes_sent", 0)
        rc = obj.get("record_count", 0)
        fmt = obj.get("export_format", "?")
        avg_sz = bs / rc if rc else 0

        if RICH:
            console.print(Columns([
                stat_card("Data Volume", f"{bs/1e6:.2f} MB", "magenta"),
                stat_card("Records", f"{rc:,}", "magenta"),
                stat_card("Format", fmt.upper(), "yellow"),
                stat_card("Avg Record", f"{avg_sz:.0f} bytes", "cyan"),
            ], padding=(0, 1)))
        else:
            print(f"  {bs/1e6:.2f} MB | {rc:,} records | {fmt} | ~{avg_sz:.0f} bytes/record")

    # ── 8. IoCs ──────────────────────────────────────────────────────────
    console.print("\n[bold cyan]── Indicators of Compromise ──[/bold cyan]\n")
    ioc_rows = conn.execute(
        "SELECT ioc_type, value, confidence, first_seen, last_seen FROM iocs"
    ).fetchall()

    if RICH:
        t5 = Table(box=box.ROUNDED, header_style="bold cyan", padding=(0, 2))
        t5.add_column("Type", width=22)
        t5.add_column("Value", width=18)
        t5.add_column("Confidence", width=12)
        t5.add_column("First Seen", width=12)
        t5.add_column("Last Seen", width=12)
        for it, val, conf, fs, ls in ioc_rows:
            cs = "[bold red]HIGH[/bold red]" if conf == "HIGH" else f"[yellow]{conf}[/yellow]"
            t5.add_row(it, f"[bold]{val}[/bold]", cs,
                       fs[11:19] if fs else "—", ls[11:19] if ls else "—")
        console.print(t5)

    conn.close()
    console.print()


if __name__ == "__main__":
    main()
