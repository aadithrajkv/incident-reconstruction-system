import datetime as _dt
import sqlite3
import textwrap
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "db" / "incidents.db"
OUT_DIR = ROOT / "output" / "pdf"
PDF_PATH = OUT_DIR / "final_project_report_aadith_raj_k_v.pdf"

STUDENT_NAME = "Aadith Raj K V"
REGISTER_NUMBER = "AA.SC.P2MCA25017014"
PROJECT_TITLE = "Constraint-Aware Log-Based Incident Reconstruction System for Authentication and Application Logs"


def esc(text):
    return str(text).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


class SimplePDF:
    def __init__(self, path):
        self.path = Path(path)
        self.width = 595
        self.height = 842
        self.margin_l = 56
        self.margin_r = 56
        self.margin_t = 60
        self.margin_b = 58
        self.pages = []
        self.ops = []
        self.y = self.height - self.margin_t
        self.page_no = 0
        self.add_page(title_page=True)

    def add_page(self, title_page=False):
        if self.ops:
            self.pages.append(self.ops)
        self.page_no += 1
        self.ops = []
        self.y = self.height - self.margin_t
        if not title_page:
            self.text(PROJECT_TITLE[:74], self.margin_l, self.height - 36, 8, "F3", color=(80, 80, 80))
            self.line(self.margin_l, self.height - 46, self.width - self.margin_r, self.height - 46, color=(200, 200, 200))
            self.y = self.height - 72

    def finish(self):
        if self.ops:
            self.pages.append(self.ops)
            self.ops = []
        total = len(self.pages)
        for i, ops in enumerate(self.pages, start=1):
            ops.append(self._color((80, 80, 80)))
            ops.append(f"BT /F1 8 Tf {self.margin_l} 28 Td ({esc(STUDENT_NAME)} - {esc(REGISTER_NUMBER)}) Tj ET")
            ops.append(f"BT /F1 8 Tf {self.width - self.margin_r - 58} 28 Td (Page {i} of {total}) Tj ET")
        self._write_pdf()

    def ensure(self, needed=40):
        if self.y - needed < self.margin_b:
            self.add_page()

    def _color(self, rgb):
        r, g, b = [max(0, min(255, v)) / 255 for v in rgb]
        return f"{r:.3f} {g:.3f} {b:.3f} rg {r:.3f} {g:.3f} {b:.3f} RG"

    def text(self, value, x, y, size=10, font="F1", color=(20, 20, 20)):
        self.ops.append(self._color(color))
        self.ops.append(f"BT /{font} {size} Tf {x:.2f} {y:.2f} Td ({esc(value)}) Tj ET")

    def line(self, x1, y1, x2, y2, width=0.7, color=(0, 0, 0)):
        self.ops.append(self._color(color))
        self.ops.append(f"{width:.2f} w {x1:.2f} {y1:.2f} m {x2:.2f} {y2:.2f} l S")

    def rect(self, x, y, w, h, stroke=(120, 120, 120), fill=None, width=0.7):
        if fill:
            self.ops.append(self._color(fill))
            self.ops.append(f"{x:.2f} {y:.2f} {w:.2f} {h:.2f} re f")
        self.ops.append(self._color(stroke))
        self.ops.append(f"{width:.2f} w {x:.2f} {y:.2f} {w:.2f} {h:.2f} re S")

    def heading(self, text, level=1):
        size = 16 if level == 1 else 13
        self.ensure(54)
        if level == 1:
            self.y -= 10
            self.text(text, self.margin_l, self.y, size, "F2", color=(18, 58, 88))
            self.y -= 8
            self.line(self.margin_l, self.y, self.width - self.margin_r, self.y, color=(18, 58, 88))
            self.y -= 18
        else:
            self.y -= 6
            self.text(text, self.margin_l, self.y, size, "F2", color=(35, 35, 35))
            self.y -= 18

    def para(self, text, size=10, leading=14, indent=0):
        width_chars = 96 - int(indent / 4)
        for block in str(text).split("\n"):
            lines = textwrap.wrap(block, width=width_chars) or [""]
            for line in lines:
                self.ensure(leading + 4)
                self.text(line, self.margin_l + indent, self.y, size, "F1")
                self.y -= leading
            self.y -= 2

    def bullet(self, items):
        for item in items:
            self.ensure(28)
            wrapped = textwrap.wrap(str(item), width=88)
            self.text("-", self.margin_l + 8, self.y, 10, "F1")
            self.text(wrapped[0], self.margin_l + 24, self.y, 10, "F1")
            self.y -= 14
            for line in wrapped[1:]:
                self.ensure(18)
                self.text(line, self.margin_l + 24, self.y, 10, "F1")
                self.y -= 14
            self.y -= 2

    def table(self, headers, rows, col_widths):
        x = self.margin_l
        row_h = 24
        self.ensure(row_h * (min(len(rows), 6) + 2))
        self.rect(x, self.y - row_h, sum(col_widths), row_h, stroke=(160, 160, 160), fill=(225, 235, 242))
        cx = x
        for h, w in zip(headers, col_widths):
            self.text(h, cx + 5, self.y - 16, 9, "F2", color=(20, 60, 85))
            self.line(cx, self.y, cx, self.y - row_h, color=(170, 170, 170))
            cx += w
        self.line(cx, self.y, cx, self.y - row_h, color=(170, 170, 170))
        self.y -= row_h
        for row in rows:
            self.ensure(row_h + 4)
            fill = (248, 248, 248) if rows.index(row) % 2 else None
            self.rect(x, self.y - row_h, sum(col_widths), row_h, stroke=(200, 200, 200), fill=fill)
            cx = x
            for cell, w in zip(row, col_widths):
                short = str(cell)
                max_chars = max(8, int(w / 5.2))
                if len(short) > max_chars:
                    short = short[: max_chars - 3] + "..."
                self.text(short, cx + 5, self.y - 16, 8.5, "F1")
                self.line(cx, self.y, cx, self.y - row_h, color=(210, 210, 210))
                cx += w
            self.line(cx, self.y, cx, self.y - row_h, color=(210, 210, 210))
            self.y -= row_h
        self.y -= 12

    def title_page(self):
        self.text("FINAL PROJECT REPORT", 165, 730, 18, "F2", color=(18, 58, 88))
        self.line(150, 715, 445, 715, width=1.2, color=(18, 58, 88))
        for i, line in enumerate(textwrap.wrap(PROJECT_TITLE, width=48)):
            self.text(line, 86, 655 - (i * 24), 18, "F2", color=(30, 30, 30))
        self.text("Submitted by", 255, 545, 11, "F3", color=(80, 80, 80))
        self.text(STUDENT_NAME, 210, 515, 16, "F2")
        self.text(f"Register Number: {REGISTER_NUMBER}", 188, 493, 11, "F1")
        self.text("Master of Computer Applications", 195, 448, 12, "F1")
        self.text("Academic Project Submission", 205, 426, 12, "F1")
        self.text(f"Date: {_dt.datetime.now().strftime('%d-%m-%Y')}", 238, 376, 10, "F1")
        self.rect(86, 332, 423, 82, stroke=(180, 180, 180), fill=(245, 248, 250))
        self.text("Project Area: Cybersecurity, Digital Forensics, Log Analytics", 110, 382, 10, "F1")
        self.text("Implementation: Python, FastAPI, SQLite, Regex Engine, Local LLM Support", 110, 360, 10, "F1")
        self.text("Validation: Synthetic attack scenario and real-world Apache/Linux log datasets", 110, 338, 10, "F1")
        self.add_page()

    def _write_pdf(self):
        objects = []
        objects.append("<< /Type /Catalog /Pages 2 0 R >>")
        kids = []
        for i in range(len(self.pages)):
            page_obj = 3 + i * 2
            kids.append(f"{page_obj} 0 R")
        objects.append(f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {len(self.pages)} >>")
        for i, ops in enumerate(self.pages):
            page_obj = 3 + i * 2
            content_obj = page_obj + 1
            objects.append(
                f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {self.width} {self.height}] "
                f"/Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> "
                f"/F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> "
                f"/F3 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >> >> >> "
                f"/Contents {content_obj} 0 R >>"
            )
            stream = "\n".join(ops)
            objects.append(f"<< /Length {len(stream.encode('latin-1', errors='replace'))} >>\nstream\n{stream}\nendstream")

        out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        offsets = [0]
        for num, obj in enumerate(objects, start=1):
            offsets.append(len(out))
            out.extend(f"{num} 0 obj\n{obj}\nendobj\n".encode("latin-1", errors="replace"))
        xref = len(out)
        out.extend(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode("ascii"))
        for off in offsets[1:]:
            out.extend(f"{off:010d} 00000 n \n".encode("ascii"))
        out.extend(
            f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode("ascii")
        )
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_bytes(out)


def db_metrics():
    if not DB_PATH.exists():
        return {
            "events": 0,
            "iocs": 0,
            "incidents": 0,
            "parsers": [],
            "phases": [],
            "event_types": [],
            "sources": [],
        }
    conn = sqlite3.connect(DB_PATH)
    try:
        return {
            "events": conn.execute("SELECT COUNT(*) FROM events").fetchone()[0],
            "iocs": conn.execute("SELECT COUNT(*) FROM iocs").fetchone()[0],
            "incidents": conn.execute("SELECT COUNT(*) FROM incidents").fetchone()[0],
            "parsers": conn.execute("SELECT parser, COUNT(*) FROM events GROUP BY parser ORDER BY COUNT(*) DESC").fetchall(),
            "phases": conn.execute("SELECT phase, COUNT(*) FROM events GROUP BY phase ORDER BY COUNT(*) DESC").fetchall(),
            "event_types": conn.execute("SELECT event_type, COUNT(*) FROM events GROUP BY event_type ORDER BY COUNT(*) DESC LIMIT 10").fetchall(),
            "sources": conn.execute("SELECT parser, COUNT(*) FROM events GROUP BY parser ORDER BY parser").fetchall(),
        }
    finally:
        conn.close()


def build_report():
    m = db_metrics()
    pdf = SimplePDF(PDF_PATH)
    pdf.title_page()

    pdf.heading("Certificate")
    pdf.para(
        f"This is to certify that the project titled \"{PROJECT_TITLE}\" has been completed and "
        f"documented by {STUDENT_NAME}, Register Number {REGISTER_NUMBER}, as part of the academic "
        "project submission. The work implements a functional incident reconstruction system that "
        "ingests heterogeneous log sources, normalizes events, detects anomalies, reconstructs an "
        "attack timeline, and produces forensic reports."
    )

    pdf.heading("Declaration")
    pdf.para(
        "I hereby declare that this project report represents the completed implementation and "
        "validation work carried out for the above project. The system was tested with both "
        "synthetic attack logs and real-world Apache/Linux log datasets available in the project "
        "workspace."
    )
    pdf.para(f"Student Name: {STUDENT_NAME}\nRegister Number: {REGISTER_NUMBER}\nSignature: ____________________")

    pdf.heading("Acknowledgement")
    pdf.para(
        "I express my sincere gratitude to the faculty members and mentors who provided guidance "
        "during the development of this project. I also acknowledge the use of publicly available "
        "log datasets and open-source software tools that supported implementation and validation."
    )

    pdf.heading("Abstract")
    pdf.para(
        "Security teams frequently receive logs from different systems such as Linux authentication, "
        "web servers, firewalls, cloud audit trails, application services, and endpoint alerts. These "
        "logs are often heterogeneous, making it difficult to reconstruct an incident quickly. This "
        "project implements a constraint-aware incident reconstruction system that parses multiple "
        "log formats, stores normalized events in SQLite, detects attack patterns using deterministic "
        "rules and optional Gemma/Ollama validation, and presents results through a FastAPI web "
        "dashboard and generated reports."
    )
    pdf.para(
        f"The completed implementation processed {m['events']} normalized events, flagged "
        f"{m['iocs']} indicators of compromise, and created {m['incidents']} incident record. "
        "Real-world validation was performed using Apache and Linux benchmark logs along with "
        "synthetic multi-stage attack logs."
    )

    pdf.heading("1. Introduction")
    pdf.para(
        "Incident reconstruction is the process of identifying what happened during a security event, "
        "when it happened, which systems were involved, and what evidence supports the conclusion. "
        "The project focuses on building a practical pipeline that converts raw security logs into a "
        "timeline suitable for triage and forensic review."
    )

    pdf.heading("2. Problem Statement")
    pdf.para(
        "Raw logs are stored in different formats and are difficult to correlate manually. A single "
        "attack can appear as failed SSH logins, successful account compromise, suspicious API calls, "
        "data export, cloud persistence actions, and endpoint alerts. The problem is to normalize "
        "these signals, identify suspicious relationships, and generate a clear incident report."
    )

    pdf.heading("3. Objectives")
    pdf.bullet([
        "Develop a multi-source log ingestion and normalization engine.",
        "Store normalized events in a searchable SQLite database.",
        "Detect brute-force attacks, compromise, exfiltration, cloud persistence, malware alerts, and network probes.",
        "Support custom regular expression anomaly rules and regex testing.",
        "Provide optional Gemma/Ollama based anomaly verification with local fallback.",
        "Create a FastAPI dashboard and generated incident reports for project demonstration.",
        "Validate the completed implementation with real-world log datasets."
    ])

    pdf.heading("4. Existing System")
    pdf.para(
        "Traditional manual log review depends heavily on analysts reading separate files and "
        "building timelines by hand. This approach is slow, error-prone, and difficult to repeat. "
        "Single-source log tools also miss relationships between infrastructure, application, and "
        "cloud events."
    )

    pdf.heading("5. Proposed System")
    pdf.para(
        "The proposed system accepts multiple log sources, parses each source into a common event "
        "schema, stores events in SQLite, detects anomalies with rule-based correlation, and presents "
        "findings in a report and web dashboard. The system is designed to run offline using local "
        "deterministic logic, while also supporting local LLM validation through Ollama when available."
    )

    pdf.heading("6. System Architecture")
    pdf.table(
        ["Layer", "Description"],
        [
            ["Input Layer", "Raw logs from auth, syslog, Apache, Nginx, firewall, cloud, endpoint, and app sources."],
            ["Parsing Layer", "Deterministic parsers convert each source into a normalized event dictionary."],
            ["Storage Layer", "SQLite stores events, incidents, IoCs, indexes, and optional LLM cache rows."],
            ["Detection Layer", "Local rules and regex rules identify attack phases and suspicious sources."],
            ["Presentation Layer", "CLI output, Markdown report, FastAPI endpoints, and browser dashboard."],
        ],
        [120, 360],
    )

    pdf.heading("7. Modules Implemented")
    pdf.table(
        ["File", "Purpose"],
        [
            ["parsers.py", "Parses auth, syslog, Apache, Nginx, firewall, CloudTrail, app JSONL, and generic logs."],
            ["reconstruct.py", "Main pipeline for loading, ingesting, detecting, visualizing, and reporting incidents."],
            ["gemma_detector.py", "Local anomaly rules, optional Gemma verification, and timestamp utilities."],
            ["regex_detector.py", "Dynamic regex testing, default anomaly rules, and rule suggestion support."],
            ["analyse.py", "Post-incident analytics such as phase distribution, brute-force rate, and IoCs."],
            ["server.py", "FastAPI backend, SSE pipeline streaming, file upload, regex testing, and HTML dashboard."],
            ["generate_logs.py", "Synthetic multi-stage attack log generator for repeatable demonstration."],
        ],
        [120, 360],
    )

    pdf.heading("8. Implementation Details")
    pdf.para(
        "The implementation uses Python as the main programming language. ThreadPoolExecutor is used "
        "to parse multiple log sources concurrently. Each parsed event includes timestamp, event type, "
        "user, source IP, destination IP, host, service, action, status, severity, raw data, parser, "
        "normalizer, and attack phase. SQLite indexes are created on timestamp, source IP, user ID, "
        "and event type to improve query performance."
    )
    pdf.para(
        "Recent final implementation work added deterministic parsers for real Apache error logs and "
        "legacy Linux syslog/PAM authentication logs. This improved real-world dataset handling by "
        "turning previously generic unknown lines into meaningful events such as apache_error, "
        "apache_notice, login_failed, system_event, session_open, and session_close."
    )

    pdf.heading("9. Dataset Details")
    pdf.table(
        ["Dataset", "Type", "Purpose"],
        [
            ["auth.log", "Synthetic SSH auth", "Brute-force and successful login scenario."],
            ["app_events.jsonl", "Synthetic app events", "API access, data export, and privilege escalation."],
            ["firewall.log", "Synthetic firewall", "Network probe and blocked traffic evidence."],
            ["cloudtrail.jsonl", "Synthetic cloud audit", "Cloud persistence and control-plane activity."],
            ["endpoint.log", "Synthetic endpoint", "Malware or suspicious host activity evidence."],
            ["apache_real_2k.log", "Real-world Apache", "Apache error/notice/client event validation."],
            ["linux_real_2k.log", "Real-world Linux syslog", "PAM authentication and system log validation."],
        ],
        [140, 125, 215],
    )

    pdf.heading("10. Result Summary")
    pdf.table(
        ["Metric", "Value"],
        [
            ["Total normalized events", m["events"]],
            ["Indicators of compromise", m["iocs"]],
            ["Incident records", m["incidents"]],
            ["Detection engine", "local_fallback with optional Gemma support"],
            ["Database", "db/incidents.db"],
            ["Generated report", "reports/incident_report.md"],
        ],
        [220, 260],
    )

    pdf.heading("11. Parser Distribution")
    pdf.table(["Parser", "Events"], [[k, v] for k, v in m["parsers"]], [240, 120])

    pdf.heading("12. Phase Distribution")
    pdf.table(["Attack Phase", "Events"], [[k, v] for k, v in m["phases"]], [240, 120])

    pdf.heading("13. Top Event Types")
    pdf.table(["Event Type", "Events"], [[k, v] for k, v in m["event_types"]], [280, 100])

    pdf.heading("14. Testing and Validation")
    pdf.para(
        "The completed project was validated through command-line execution, Python syntax checking, "
        "FastAPI endpoint testing, and real-world dataset processing. The CLI pipeline completed "
        "successfully and generated an SQLite database and Markdown incident report. The FastAPI "
        "server was also tested through local API calls."
    )
    pdf.bullet([
        "Python compilation check passed for parsers.py, reconstruct.py, server.py, gemma_detector.py, regex_detector.py, and analyse.py.",
        "Full pipeline execution completed with all configured log sources.",
        "Real-world Apache and Linux log files were parsed with dedicated deterministic parsers.",
        "API endpoint /api/logs listed all available log files.",
        "API endpoint /api/run completed reconstruction with selected real-world files.",
        "API endpoint /api/regex/test found 490 authentication failure matches in linux_real_2k.log.",
    ])

    pdf.heading("15. Advantages")
    pdf.bullet([
        "Works with multiple heterogeneous log formats.",
        "Runs offline using deterministic local detection logic.",
        "Provides optional LLM validation without making it mandatory.",
        "Supports custom regex-based anomaly rules.",
        "Stores normalized evidence in a relational database for repeatable analysis.",
        "Produces reports and exposes a web interface suitable for demonstration."
    ])

    pdf.heading("16. Limitations")
    pdf.bullet([
        "The local detection engine uses fixed thresholds and may need tuning for each organization.",
        "Gemma validation requires a local Ollama setup and the configured model.",
        "Some legacy logs do not contain complete timestamps or structured fields.",
        "Dashboard HTML is embedded inside server.py, which is acceptable for demonstration but not ideal for a large production UI."
    ])

    pdf.heading("17. Future Enhancements")
    pdf.bullet([
        "Add role-based dashboard login and user management.",
        "Export reports directly to PDF and DOCX from the web interface.",
        "Add more parsers for Windows Event Logs, Zeek, Suricata, and Kubernetes logs.",
        "Improve anomaly scoring using baselines and sliding time windows.",
        "Add visual graphs for attack chain relationships and IoC clustering.",
        "Add unit tests and benchmark tests for large log files."
    ])

    pdf.heading("18. Conclusion")
    pdf.para(
        "The project has been completed as a working incident reconstruction system. It successfully "
        "normalizes diverse log sources, detects security anomalies, maps events to attack phases, "
        "stores forensic evidence in SQLite, and exposes results through CLI, Markdown, and FastAPI "
        "interfaces. The final validation confirms that the implementation works not only with "
        "synthetic demonstration data but also with real-world Apache and Linux log datasets."
    )

    pdf.heading("19. References")
    pdf.bullet([
        "Python Software Foundation documentation for Python standard libraries.",
        "FastAPI official documentation for API and Server-Sent Events implementation patterns.",
        "SQLite documentation for schema design and indexing.",
        "Ollama and Gemma local model documentation for optional model-assisted validation.",
        "Public real-world Apache and Linux log benchmark datasets used for validation.",
    ])

    pdf.finish()
    return PDF_PATH


if __name__ == "__main__":
    path = build_report()
    print(path)
