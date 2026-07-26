import asyncio
import json
import os
import sqlite3
from pathlib import Path
from typing import List, Optional
import uvicorn
from fastapi import FastAPI, HTTPException, Query, UploadFile, File
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel

# Import existing pipeline components
import parsers
import reconstruct
import gemma_detector
import regex_detector

app = FastAPI(title="Constraint-Aware Incident Reconstruction Server")

DB_PATH = Path("db/incidents.db")
REPORT_PATH = Path("reports/incident_report.md")
LOGS_DIR = Path("logs")

class RegexRule(BaseModel):
    id: str
    name: str
    pattern: str
    field: str
    severity: str
    confidence: float
    phase: str
    description: str

class RegexTestRequest(BaseModel):
    log_file: str
    pattern: str
    field: str = "raw_data"

@app.get("/api/logs")
def list_logs():
    """Lists available log files and their sizes/line counts."""
    if not LOGS_DIR.exists():
        return []
    
    log_files = []
    for f in LOGS_DIR.glob("*"):
        if f.is_file() and f.suffix in {".log", ".jsonl", ".txt"}:
            content = f.read_text(errors="ignore")
            lines = content.splitlines()
            log_files.append({
                "filename": f.name,
                "size_bytes": f.stat().st_size,
                "lines_count": len(lines),
                "preview": lines[:5] if lines else []
            })
    return sorted(log_files, key=lambda x: x["filename"])

@app.post("/api/logs/generate")
def generate_logs():
    """Triggers the synthetic log generator."""
    try:
        import generate_logs
        # Re-import to trigger main execution if already loaded
        import importlib
        importlib.reload(generate_logs)
        return {"status": "success", "message": "Synthetic logs generated successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/regex/test")
def test_regex(req: RegexTestRequest):
    """Tests a regular expression against a specific log file and returns matching entries."""
    path = LOGS_DIR / req.log_file
    if not path.exists():
        raise HTTPException(status_code=404, detail="Log file not found.")
        
    try:
        # Determine the parser type based on filename suffix / name
        log_type = "generic"
        if "auth" in req.log_file:
            log_type = "auth"
        elif "nginx" in req.log_file:
            log_type = "nginx"
        elif "firewall" in req.log_file:
            log_type = "firewall"
        elif "cloud" in req.log_file:
            log_type = "cloudtrail"
        elif "app" in req.log_file:
            log_type = "app_jsonl"
        elif "apache" in req.log_file:
            log_type = "apache_error"
        elif "linux" in req.log_file or "syslog" in req.log_file:
            log_type = "syslog"
            
        events = parsers.parse_log_source(path, log_type, use_gemma=False)
        matches = regex_detector.test_regex_rule(events, req.pattern, req.field)
        
        return {
            "total_events": len(events),
            "match_count": len(matches),
            "matches": matches[:100]  # Limit to first 100 matches
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Regex Error: {str(e)}")

@app.get("/api/regex/suggest")
def suggest_rules():
    """Generates suggested regular expression rules based on existing logs."""
    try:
        events, _ = reconstruct.load_events()
        suggestions = regex_detector.suggest_regex_rules(events)
        return suggestions
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/results")
def get_results():
    """Returns database reconstruction results (events, findings, IOCs, markdown report)."""
    if not DB_PATH.exists():
        return {"status": "empty", "message": "No database found. Run reconstruction first."}
        
    conn = sqlite3.connect(DB_PATH)
    try:
        # Load events
        conn.row_factory = sqlite3.Row
        events_rows = conn.execute("""
            SELECT id, timestamp, event_type, user_id, source_ip, destination_ip,
                   hostname, service, action, status, severity, raw_data, parser,
                   normalized_by, phase
            FROM events
            ORDER BY COALESCE(timestamp, '')
        """).fetchall()
        events = [dict(r) for r in events_rows]
        
        # Load IOCs
        iocs_rows = conn.execute("SELECT ioc_type, value, confidence, first_seen, last_seen FROM iocs").fetchall()
        iocs = [dict(r) for r in iocs_rows]
        
        # Load Incident Records
        incidents_rows = conn.execute("SELECT incident_id, title, severity, start_time, end_time, description FROM incidents").fetchall()
        incidents = [dict(r) for r in incidents_rows]
        
        # Load Report Content
        report_content = ""
        if REPORT_PATH.exists():
            report_content = REPORT_PATH.read_text()
            
        return {
            "status": "success",
            "events": events,
            "iocs": iocs,
            "incidents": incidents,
            "report_md": report_content
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/api/logs/upload")
async def upload_log_file(file: UploadFile = File(...)):
    """Allows uploading custom log files into the logs/ directory."""
    if not LOGS_DIR.exists():
        LOGS_DIR.mkdir(exist_ok=True)
    
    # Secure filename simple guard
    filename = Path(file.filename).name
    if not filename.endswith((".log", ".jsonl", ".txt")):
        raise HTTPException(status_code=400, detail="Only .log, .jsonl, and .txt files are supported.")
        
    target_path = LOGS_DIR / filename
    try:
        content = await file.read()
        target_path.write_bytes(content)
        return {"status": "success", "filename": filename, "message": f"Log file '{filename}' uploaded successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload: {str(e)}")

@app.get("/api/gemma/status")
def gemma_status():
    """Checks Ollama connectivity and whether the configured model is available."""
    return gemma_detector.check_ollama_connectivity()

@app.get("/api/run")
async def run_pipeline(
    use_gemma: bool = Query(False),
    use_custom_regex: bool = Query(False),
    custom_rules_json: Optional[str] = Query(None),
    files: Optional[List[str]] = Query(None)
):
    """
    Streams the incident reconstruction pipeline progress step-by-step
    via Server-Sent Events (SSE).
    """
    async def sse_generator():
        try:
            # Step 1: INGEST
            yield f"data: {json.dumps({'step': 'INGEST', 'status': 'running', 'message': 'Starting log parsing...'})}\n\n"
            await asyncio.sleep(0.4)
            
            # Setup DB directory
            DB_PATH.parent.mkdir(exist_ok=True)
            DB_PATH.unlink(missing_ok=True)
            
            yield f"data: {json.dumps({'step': 'INGEST', 'status': 'running', 'message': 'Parsing selected source logs concurrently (Thread Pool)...'})}\n\n"
            events, source_counts = reconstruct.load_events(active_files=files)
            await asyncio.sleep(0.4)
            yield f"data: {json.dumps({'step': 'INGEST', 'status': 'completed', 'message': f'Parsed {len(events)} events from {len(source_counts)} log sources.'})}\n\n"
            
            # Step 2: NORMALIZE
            yield f"data: {json.dumps({'step': 'NORMALIZE', 'status': 'running', 'message': 'Initializing SQLite Schema and writing tables...'})}\n\n"
            conn = sqlite3.connect(DB_PATH)
            reconstruct.init_db(conn)
            await asyncio.sleep(0.3)
            
            yield f"data: {json.dumps({'step': 'NORMALIZE', 'status': 'running', 'message': f'Bulk-inserting {len(events)} normalized records with SQLite indices...'})}\n\n"
            reconstruct.ingest(conn, events)
            db_events = reconstruct.load_events_from_db(conn)
            await asyncio.sleep(0.4)
            yield f"data: {json.dumps({'step': 'NORMALIZE', 'status': 'completed', 'message': 'Ingestion finished. SQLite indexes verified.'})}\n\n"
            
            # Step 3: DETECT
            detection_result = {}
            if use_custom_regex:
                yield f"data: {json.dumps({'step': 'DETECT', 'status': 'running', 'message': 'Running custom Regex-based Anomaly engine...'})}\n\n"
                rules = regex_detector.DEFAULT_REGEX_RULES
                if custom_rules_json:
                    try:
                        rules = json.loads(custom_rules_json)
                    except Exception as e:
                        yield f"data: {json.dumps({'step': 'DETECT', 'status': 'error', 'message': f'Invalid custom rules: {str(e)}. Falling back to default regex.'})}\n\n"
                
                # Execute regex engine
                detection_result = regex_detector.run_regex_detection(db_events, rules)
                await asyncio.sleep(0.4)
                
                # Apply detections to SQLite
                for finding in detection_result["findings"]:
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

                # Populate IoCs
                for ioc in detection_result["iocs"]:
                    first_seen, last_seen = gemma_detector.timestamp_bounds(db_events, source_ip=ioc["value"]) if ioc["ioc_type"] == "ip" else gemma_detector.timestamp_bounds(db_events, user_id=ioc["value"])
                    conn.execute("""
                        INSERT INTO iocs (ioc_type, value, confidence, first_seen, last_seen)
                        VALUES (?, ?, ?, ?, ?)
                    """, (ioc["ioc_type"], ioc["value"], ioc["confidence"], first_seen, last_seen))

                # Populate incident record
                if detection_result["findings"]:
                    top = detection_result["findings"][0]
                    incident_start = min((f.get("start") for f in detection_result["findings"] if f.get("start")), default=None)
                    incident_end = max((f.get("end") for f in detection_result["findings"] if f.get("end")), default=None)
                    conn.execute("""
                        INSERT INTO incidents (incident_id, title, severity, start_time, end_time, description)
                        VALUES (?, ?, ?, ?, ?, ?)
                    """, ("INC-REG-001", top["title"], top["severity"], incident_start, incident_end, detection_result.get("summary", "")))
                
                conn.commit()
            elif use_gemma:
                # --- GEMMA PATH: rich streaming ---
                yield f"data: {json.dumps({'step': 'DETECT', 'status': 'running', 'message': 'Gemma mode active. Checking Ollama connectivity...', 'engine': 'gemma'})}\n\n"
                await asyncio.sleep(0.3)

                status = gemma_detector.check_ollama_connectivity()
                base_url = status["base_url"]
                model_name = status["model"]

                if not status["reachable"]:
                    msg = f"Ollama not reachable at {base_url}. Falling back to local detector."
                    yield f"data: {json.dumps({'step': 'DETECT', 'status': 'warning', 'message': msg, 'engine': 'fallback'})}\n\n"
                    await asyncio.sleep(0.3)
                    detection_result = reconstruct.apply_detection(conn, db_events, use_gemma=False)
                elif not status["model_available"]:
                    available_str = ", ".join(status["models"]) or "none pulled"
                    msg = f"Model '{model_name}' not found in Ollama. Available: [{available_str}]. Falling back to local detector."
                    yield f"data: {json.dumps({'step': 'DETECT', 'status': 'warning', 'message': msg, 'engine': 'fallback'})}\n\n"
                    await asyncio.sleep(0.3)
                    detection_result = reconstruct.apply_detection(conn, db_events, use_gemma=False)
                else:
                    available_str = ", ".join(status["models"])
                    msg = f"Ollama reachable. Model '{model_name}' ready. Available: [{available_str}]"
                    yield f"data: {json.dumps({'step': 'DETECT', 'status': 'running', 'message': msg, 'engine': 'gemma'})}\n\n"
                    await asyncio.sleep(0.4)

                    # Run local detector first to get candidates
                    yield f"data: {json.dumps({'step': 'DETECT', 'status': 'running', 'message': 'Running deterministic pre-scan to build candidate findings for Gemma...', 'engine': 'gemma'})}\n\n"
                    await asyncio.sleep(0.3)
                    local_pre = gemma_detector.detect_anomalies_locally(db_events)
                    candidates = gemma_detector._brief_candidates(local_pre["findings"])
                    num_candidates = len(candidates)
                    candidate_names = ", ".join(c["title"] for c in candidates) or "none"
                    msg = f"Pre-scan found {num_candidates} candidate anomalies: [{candidate_names}]"
                    yield f"data: {json.dumps({'step': 'DETECT', 'status': 'running', 'message': msg, 'engine': 'gemma'})}\n\n"
                    await asyncio.sleep(0.3)

                    msg = f"Sending candidates to Gemma ({model_name}) for validation. This may take a moment..."
                    yield f"data: {json.dumps({'step': 'DETECT', 'status': 'running', 'message': msg, 'engine': 'gemma'})}\n\n"
                    # Run Gemma detection synchronously (same thread as conn)
                    detection_result = reconstruct.apply_detection(conn, db_events, use_gemma=True)
                    engine_used = detection_result.get("engine", "unknown")
                    if engine_used == "gemma":
                        accepted = [f["title"] for f in detection_result.get("findings", [])]
                        accepted_str = ", ".join(accepted) or "none"
                        msg = f"Gemma responded. Accepted rules: [{accepted_str}]"
                        yield f"data: {json.dumps({'step': 'DETECT', 'status': 'running', 'message': msg, 'engine': 'gemma'})}\n\n"
                        gemma_summary = detection_result.get("summary", "")
                        if gemma_summary:
                            msg = f"Gemma summary: {gemma_summary}"
                            yield f"data: {json.dumps({'step': 'DETECT', 'status': 'running', 'message': msg, 'engine': 'gemma'})}\n\n"
                    else:
                        gemma_err = detection_result.get("gemma_error", "")
                        err_detail = f" Error: {gemma_err}" if gemma_err else " Check Ollama logs."
                        msg = f"Gemma call fell back to local engine.{err_detail}"
                        yield f"data: {json.dumps({'step': 'DETECT', 'status': 'warning', 'message': msg, 'engine': 'fallback'})}\n\n"
                    await asyncio.sleep(0.3)
            else:
                yield f"data: {json.dumps({'step': 'DETECT', 'status': 'running', 'message': 'Running deterministic local anomaly engine (Gemma disabled)...', 'engine': 'local'})}\n\n"
                detection_result = reconstruct.apply_detection(conn, db_events, use_gemma=False)
                await asyncio.sleep(0.4)
                
            findings_len = len(detection_result.get("findings", []))
            iocs_len = len(detection_result.get("iocs", []))
            yield f"data: {json.dumps({'step': 'DETECT', 'status': 'completed', 'message': f'Detected {findings_len} anomalies and flagged {iocs_len} IoCs.'})}\n\n"
            
            # Step 4: REPORT
            yield f"data: {json.dumps({'step': 'REPORT', 'status': 'running', 'message': 'Generating Markdown Incident Triage Report...'})}\n\n"
            report_path = reconstruct.generate_report(conn, detection_result, source_counts)
            conn.close()
            await asyncio.sleep(0.4)
            yield f"data: {json.dumps({'step': 'REPORT', 'status': 'completed', 'message': f'Triage report exported to {report_path}. Database finalized.'})}\n\n"
            
            # Finished
            yield f"data: {json.dumps({'step': 'FINISHED', 'status': 'completed', 'message': 'Incident reconstruction completed successfully!'})}\n\n"
            
        except Exception as e:
            yield f"data: {json.dumps({'step': 'ERROR', 'status': 'failed', 'message': f'Pipeline failed: {str(e)}'})}\n\n"

    return StreamingResponse(sse_generator(), media_type="text/event-stream")


@app.get("/", response_class=HTMLResponse)
def serve_gui():
    """Serves the main HTML Web UI client."""
    html_content = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Incident Reconstruct</title>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: monospace; font-size: 14px; background: #fff; color: #111; padding: 20px; max-width: 1100px; margin: 0 auto; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        h2 { font-size: 15px; margin: 18px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
        h3 { font-size: 13px; margin: 12px 0 6px; }
        button { font-family: monospace; font-size: 13px; padding: 6px 14px; cursor: pointer; border: 1px solid #999; background: #f5f5f5; }
        button:hover { background: #e8e8e8; }
        button:disabled { opacity: 0.4; cursor: not-allowed; }
        input[type="file"] { font-family: monospace; font-size: 12px; }
        input[type="checkbox"] { margin-right: 4px; vertical-align: middle; }
        label { font-size: 13px; cursor: pointer; }
        select { font-family: monospace; font-size: 13px; padding: 4px; border: 1px solid #999; }
        textarea { font-family: monospace; font-size: 12px; border: 1px solid #999; padding: 6px; width: 100%; resize: vertical; }
        table { border-collapse: collapse; width: 100%; font-size: 12px; margin-top: 6px; }
        th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: left; vertical-align: top; }
        th { background: #f0f0f0; font-weight: bold; }
        .section { margin-bottom: 20px; }
        .terminal { background: #111; color: #ddd; font-size: 12px; padding: 10px; height: 260px; overflow-y: auto; border: 1px solid #333; white-space: pre-wrap; word-break: break-all; }
        .terminal .warn { color: #cc8800; }
        .terminal .err { color: #cc3333; }
        .terminal .ok { color: #338833; }
        .terminal .engine { color: #8888cc; font-weight: bold; }
        .tabs { display: flex; gap: 0; border-bottom: 1px solid #ccc; margin-bottom: 10px; }
        .tabs button { border: 1px solid #ccc; border-bottom: none; background: #f5f5f5; padding: 6px 16px; font-size: 12px; }
        .tabs button.active { background: #fff; font-weight: bold; border-bottom: 1px solid #fff; margin-bottom: -1px; }
        .tab-panel { display: none; }
        .tab-panel.active { display: block; }
        .status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
        .dot-green { background: #338833; }
        .dot-red { background: #cc3333; }
        .dot-yellow { background: #cc8800; }
        .dot-gray { background: #999; }
        .log-item { padding: 4px 8px; border: 1px solid #ddd; margin: 2px 0; display: flex; align-items: center; gap: 8px; font-size: 12px; }
        .log-item input { margin: 0; }
        .report-content { font-family: sans-serif; font-size: 13px; line-height: 1.6; }
        .report-content h1 { font-size: 18px; } .report-content h2 { font-size: 15px; } .report-content h3 { font-size: 13px; }
        .report-content table { margin: 8px 0; }
        .report-content code { background: #f0f0f0; padding: 1px 4px; font-size: 12px; }
        .report-content pre { background: #f5f5f5; padding: 8px; overflow-x: auto; border: 1px solid #ddd; }
        .flex-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
        .gemma-status { font-size: 12px; padding: 6px 10px; border: 1px solid #ddd; margin-top: 6px; display: none; }
        .small { font-size: 11px; color: #666; }
    </style>
</head>
<body>
    <h1>Incident Reconstruct</h1>
    <p class="small">Log analysis &amp; anomaly detection pipeline</p>

    <!-- Log Files -->
    <h2>1. Log Files</h2>
    <div class="section">
        <div class="flex-row" style="margin-bottom:8px;">
            <button onclick="loadLogs()">Refresh Logs</button>
            <button onclick="generateLogs()">Generate Sample Logs</button>
            <label style="font-size:12px;">
                Upload: <input type="file" accept=".log,.jsonl,.txt" onchange="uploadFile(this)">
            </label>
        </div>
        <div id="log-list">
            <span class="small">Click "Refresh Logs" to load available files.</span>
        </div>
    </div>

    <!-- Options -->
    <h2>2. Options</h2>
    <div class="section">
        <div class="flex-row">
            <label><input type="checkbox" id="toggle-gemma" onchange="checkGemmaStatus()"> Use Gemma LLM</label>
            <label><input type="checkbox" id="toggle-regex" onchange="toggleRegexPanel()"> Custom Regex</label>
        </div>
        <div id="gemma-status" class="gemma-status"></div>
        <div id="regex-panel" style="display:none; margin-top:10px;">
            <h3>Regex Rules (JSON array)</h3>
            <textarea id="regex-rules" rows="5" placeholder='[{"id":"R1","name":"Test","pattern":"error","field":"raw_data","severity":"high","confidence":0.8,"phase":"anomaly","description":"test rule"}]'></textarea>
        </div>
    </div>

    <!-- Run -->
    <h2>3. Run Pipeline</h2>
    <div class="section">
        <button id="run-btn" onclick="runPipeline()">&#9654; Run</button>
        <span id="run-status" class="small" style="margin-left:10px;"></span>
        <div class="terminal" id="terminal" style="margin-top:8px;">Waiting to start...\n</div>
    </div>

    <!-- Results -->
    <h2>4. Results</h2>
    <div class="section">
        <div class="tabs">
            <button class="active" onclick="switchTab('events')">Events</button>
            <button onclick="switchTab('findings')">Findings &amp; IoCs</button>
            <button onclick="switchTab('report')">Report</button>
        </div>
        <div id="panel-events" class="tab-panel active">
            <p class="small">Run the pipeline to see normalized events.</p>
        </div>
        <div id="panel-findings" class="tab-panel">
            <p class="small">Run the pipeline to see findings.</p>
        </div>
        <div id="panel-report" class="tab-panel">
            <p class="small">Run the pipeline to see the report.</p>
        </div>
    </div>

<script>
    let customRules = [];

    // --- Log file management ---
    async function loadLogs() {
        try {
            const res = await fetch('/api/logs');
            const logs = await res.json();
            const container = document.getElementById('log-list');
            if (logs.length === 0) {
                container.innerHTML = '<span class="small">No log files found in logs/ directory.</span>';
                return;
            }
            let html = '';
            logs.forEach(log => {
                const sizeKB = (log.size_bytes / 1024).toFixed(1);
                html += '<div class="log-item">' +
                    '<input type="checkbox" class="log-check" value="' + log.filename + '" checked>' +
                    '<span><b>' + log.filename + '</b> — ' + sizeKB + ' KB, ' + log.lines_count + ' lines</span>' +
                    '</div>';
            });
            container.innerHTML = html;
        } catch (e) {
            document.getElementById('log-list').textContent = 'Error: ' + e.message;
        }
    }

    async function generateLogs() {
        try {
            const res = await fetch('/api/logs/generate', { method: 'POST' });
            const data = await res.json();
            alert(data.message || 'Done');
            loadLogs();
        } catch (e) { alert('Error: ' + e.message); }
    }

    async function uploadFile(input) {
        if (!input.files.length) return;
        const form = new FormData();
        form.append('file', input.files[0]);
        try {
            const res = await fetch('/api/logs/upload', { method: 'POST', body: form });
            const data = await res.json();
            alert(data.message || 'Uploaded');
            loadLogs();
        } catch (e) { alert('Upload failed: ' + e.message); }
        input.value = '';
    }

    // --- Gemma status ---
    async function checkGemmaStatus() {
        const card = document.getElementById('gemma-status');
        const checked = document.getElementById('toggle-gemma').checked;
        if (!checked) { card.style.display = 'none'; return; }
        card.style.display = 'block';
        card.innerHTML = '<span class="status-dot dot-yellow"></span> Checking Ollama...';
        try {
            const res = await fetch('/api/gemma/status');
            const d = await res.json();
            if (d.reachable && d.model_available) {
                card.innerHTML = '<span class="status-dot dot-green"></span> Ollama online. Model: ' + d.model + '. Available: ' + (d.models.join(', ') || 'none');
            } else if (d.reachable) {
                card.innerHTML = '<span class="status-dot dot-yellow"></span> Ollama online but model "' + d.model + '" not found. Available: ' + (d.models.join(', ') || 'none') + '. Run: <code>ollama pull ' + d.model + '</code>';
            } else {
                card.innerHTML = '<span class="status-dot dot-red"></span> Ollama unreachable at ' + d.base_url + '. ' + (d.error || '');
            }
        } catch (e) {
            card.innerHTML = '<span class="status-dot dot-red"></span> Status check failed: ' + e.message;
        }
    }

    // --- Regex panel ---
    function toggleRegexPanel() {
        document.getElementById('regex-panel').style.display =
            document.getElementById('toggle-regex').checked ? 'block' : 'none';
    }

    // --- Tabs ---
    function switchTab(name) {
        document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        // Find the clicked button
        const btns = document.querySelectorAll('.tabs button');
        const panels = { 'events': 'panel-events', 'findings': 'panel-findings', 'report': 'panel-report' };
        const idx = { 'events': 0, 'findings': 1, 'report': 2 };
        if (idx[name] !== undefined) btns[idx[name]].classList.add('active');
        document.getElementById(panels[name]).classList.add('active');
    }

    // --- Run pipeline ---
    function runPipeline() {
        const btn = document.getElementById('run-btn');
        const terminal = document.getElementById('terminal');
        const statusSpan = document.getElementById('run-status');
        btn.disabled = true;
        terminal.textContent = '';
        statusSpan.textContent = 'Running...';

        // Collect selected files
        const checks = document.querySelectorAll('.log-check:checked');
        const files = Array.from(checks).map(c => c.value);

        const useGemma = document.getElementById('toggle-gemma').checked;
        const useRegex = document.getElementById('toggle-regex').checked;

        let url = '/api/run?use_gemma=' + useGemma + '&use_custom_regex=' + useRegex;
        files.forEach(f => { url += '&files=' + encodeURIComponent(f); });

        if (useRegex) {
            const rulesText = document.getElementById('regex-rules').value.trim();
            if (rulesText) {
                url += '&custom_rules_json=' + encodeURIComponent(rulesText);
            }
        }

        const es = new EventSource(url);
        es.onmessage = function(event) {
            const d = JSON.parse(event.data);
            const step = d.step;
            const status = d.status;
            const msg = d.message;
            const engine = d.engine || '';

            const line = document.createElement('div');

            // Engine tag
            let prefix = '';
            if (engine === 'gemma') prefix = '[GEMMA] ';
            else if (engine === 'fallback') prefix = '[FALLBACK] ';
            else if (engine === 'local') prefix = '[LOCAL] ';

            if (status === 'failed') {
                line.className = 'err';
                line.textContent = '[ERROR] ' + prefix + msg;
            } else if (status === 'warning') {
                line.className = 'warn';
                line.textContent = '[WARN] ' + prefix + msg;
            } else if (status === 'completed') {
                line.className = 'ok';
                line.textContent = '[OK] ' + prefix + msg;
            } else {
                if (engine) line.className = 'engine';
                line.textContent = '[' + step + '] ' + prefix + msg;
            }
            terminal.appendChild(line);
            terminal.scrollTop = terminal.scrollHeight;

            if (step === 'FINISHED' || step === 'ERROR') {
                es.close();
                btn.disabled = false;
                statusSpan.textContent = step === 'FINISHED' ? 'Done.' : 'Failed.';
                if (step === 'FINISHED') loadResults();
            }
        };
        es.onerror = function() {
            es.close();
            btn.disabled = false;
            statusSpan.textContent = 'Connection lost.';
        };
    }

    // --- Load results ---
    async function loadResults() {
        try {
            const res = await fetch('/api/results');
            const data = await res.json();
            if (data.status !== 'success') return;
            renderEvents(data.events);
            renderFindings(data.incidents, data.iocs);
            renderReport(data.report_md);
            switchTab('events');
        } catch (e) { console.error(e); }
    }

    function renderEvents(events) {
        const panel = document.getElementById('panel-events');
        if (!events.length) { panel.innerHTML = '<p class="small">No events.</p>'; return; }
        let html = '<p class="small">' + events.length + ' events</p>';
        html += '<div style="max-height:400px;overflow:auto;">';
        html += '<table><tr><th>#</th><th>Time</th><th>Type</th><th>User</th><th>Src IP</th><th>Service</th><th>Action</th><th>Status</th><th>Severity</th><th>Phase</th><th>Parser</th></tr>';
        events.forEach((ev, i) => {
            html += '<tr>' +
                '<td>' + (i+1) + '</td>' +
                '<td>' + (ev.timestamp || '-') + '</td>' +
                '<td>' + (ev.event_type || '-') + '</td>' +
                '<td>' + (ev.user_id || '-') + '</td>' +
                '<td>' + (ev.source_ip || '-') + '</td>' +
                '<td>' + (ev.service || '-') + '</td>' +
                '<td>' + (ev.action || '-') + '</td>' +
                '<td>' + (ev.status || '-') + '</td>' +
                '<td>' + (ev.severity || '-') + '</td>' +
                '<td>' + (ev.phase || '-') + '</td>' +
                '<td>' + (ev.parser || '-') + '</td>' +
                '</tr>';
        });
        html += '</table></div>';
        panel.innerHTML = html;
    }

    function renderFindings(incidents, iocs) {
        const panel = document.getElementById('panel-findings');
        let html = '';

        html += '<h3>Incidents (' + incidents.length + ')</h3>';
        if (incidents.length) {
            html += '<table><tr><th>ID</th><th>Title</th><th>Severity</th><th>Start</th><th>End</th><th>Description</th></tr>';
            incidents.forEach(inc => {
                html += '<tr><td>' + inc.incident_id + '</td><td>' + inc.title + '</td><td>' + inc.severity + '</td><td>' + (inc.start_time||'-') + '</td><td>' + (inc.end_time||'-') + '</td><td>' + (inc.description||'') + '</td></tr>';
            });
            html += '</table>';
        } else { html += '<p class="small">None.</p>'; }

        html += '<h3>IoCs (' + iocs.length + ')</h3>';
        if (iocs.length) {
            html += '<table><tr><th>Type</th><th>Value</th><th>Confidence</th><th>First Seen</th><th>Last Seen</th></tr>';
            iocs.forEach(ioc => {
                html += '<tr><td>' + ioc.ioc_type + '</td><td>' + ioc.value + '</td><td>' + ioc.confidence + '</td><td>' + (ioc.first_seen||'-') + '</td><td>' + (ioc.last_seen||'-') + '</td></tr>';
            });
            html += '</table>';
        } else { html += '<p class="small">None.</p>'; }

        panel.innerHTML = html;
    }

    function renderReport(md) {
        const panel = document.getElementById('panel-report');
        if (!md) { panel.innerHTML = '<p class="small">No report generated.</p>'; return; }
        panel.innerHTML = '<div class="report-content">' + marked.parse(md) + '</div>';
    }

    // Auto-load logs on page load
    window.addEventListener('DOMContentLoaded', loadLogs);
</script>
</body>
</html>
"""
    return HTMLResponse(content=html_content, status_code=200)

if __name__ == "__main__":
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host=host, port=port)
