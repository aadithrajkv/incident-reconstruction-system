# Constraint-Aware Incident Reconstruction

Final MCA project by **Aadith Raj K V**  
Register Number: **AA.SC.P2MCA25017014**

## Overview

This project implements a multi-source cybersecurity incident reconstruction system. It parses heterogeneous logs, normalizes events into SQLite, detects anomalies, reconstructs attack phases, and provides CLI, report, and FastAPI dashboard interfaces.

## Features

- Multi-source log parsing for SSH auth, Linux syslog, Apache error logs, Nginx access logs, firewall logs, CloudTrail JSONL, endpoint logs, and application JSONL.
- SQLite event store with indexes for timeline and filtering queries.
- Local deterministic anomaly detection for brute force, compromise, exfiltration, privilege escalation, malware, network probes, and cloud persistence.
- Custom regex anomaly engine.
- Optional Gemma/Ollama validation path with local fallback.
- FastAPI web dashboard with Server-Sent Events progress streaming.
- Markdown and PDF report generation utilities.

## Run Locally

Install dependencies:

```bash
python3 -m pip install -r requirements.txt
```

Generate or refresh sample logs:

```bash
python3 generate_logs.py
```

Run the reconstruction pipeline:

```bash
python3 reconstruct.py
```

Run post-incident analytics:

```bash
python3 analyse.py
```

Start the web dashboard:

```bash
python3 server.py
```

Open:

```text
http://127.0.0.1:8000
```

## Final Report

Generated reports and screenshots are intentionally ignored by git. To regenerate the 30+ page project report:

```bash
python3 generate_30_page_project_report_pdf.py
```

The PDF will be written under:

```text
output/pdf/
```

## Main Files

- `parsers.py` - deterministic log parsers and generic fallback normalizer
- `reconstruct.py` - main ingestion, detection, timeline, and report pipeline
- `gemma_detector.py` - local detection and optional Gemma/Ollama validation
- `regex_detector.py` - regex anomaly engine and suggestions
- `analyse.py` - post-incident analytics
- `server.py` - FastAPI backend and dashboard
- `generate_logs.py` - synthetic attack dataset generator
- `generate_30_page_project_report_pdf.py` - final academic report generator

## Validation Summary

The completed implementation was validated with synthetic multi-stage attack logs and real-world Apache/Linux log datasets. The latest run processed thousands of normalized events, extracted indicators of compromise, and generated incident reports through both CLI and API workflows.
