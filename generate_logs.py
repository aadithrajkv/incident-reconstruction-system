"""
generate_logs.py
Generates synthetic Linux auth logs and JSON application logs
simulating a brute-force login followed by unauthorized data export.
Dataset: Fully synthetic — modelled after LANL auth logs & CICIDS 2017 patterns.
"""

import json
import random
from datetime import datetime, timedelta
from pathlib import Path

# ── Config ──────────────────────────────────────────────────────────────────
ATTACKER_IP  = "203.0.113.47"
VICTIM_USER  = "admin"
DECOY_USERS  = ["root", "ubuntu", "deploy", "oracle", "test"]
LEGIT_USERS  = ["alice", "bob", "charlie"]
START_TIME   = datetime(2024, 11, 15, 2, 10, 0)   # 2 AM attack window
AUTH_LOG     = Path("logs/auth.log")
APP_LOG      = Path("logs/app_events.jsonl")
NGINX_LOG    = Path("logs/nginx_access.log")
FIREWALL_LOG = Path("logs/firewall.log")
CLOUD_LOG    = Path("logs/cloudtrail.jsonl")
ENDPOINT_LOG = Path("logs/endpoint.log")

random.seed(42)
AUTH_LOG.parent.mkdir(exist_ok=True)

def ts(dt):
    return dt.strftime("%b %d %H:%M:%S")

def iso(dt):
    return dt.isoformat() + "Z"

# ── Phase 1: Brute-Force (2:10 – 2:18) ──────────────────────────────────────
auth_lines = []
t = START_TIME

# Some background legit logins before attack
for i in range(5):
    t -= timedelta(minutes=random.randint(5, 20))
    user = random.choice(LEGIT_USERS)
    auth_lines.append(f"{ts(t)} server01 sshd[{random.randint(1000,9999)}]: "
                      f"Accepted password for {user} from 10.0.0.{random.randint(2,20)} port {random.randint(30000,60000)} ssh2\n")

auth_lines.sort()   # keep chronological

t = START_TIME
# Failed attempts on wrong users
for i in range(18):
    user = random.choice(DECOY_USERS)
    auth_lines.append(f"{ts(t)} server01 sshd[{random.randint(1000,9999)}]: "
                      f"Failed password for {user} from {ATTACKER_IP} port {random.randint(30000,60000)} ssh2\n")
    t += timedelta(seconds=random.randint(8, 22))

# Failed attempts on real user (20 attempts)
for i in range(20):
    auth_lines.append(f"{ts(t)} server01 sshd[{random.randint(1000,9999)}]: "
                      f"Failed password for {VICTIM_USER} from {ATTACKER_IP} port {random.randint(30000,60000)} ssh2\n")
    t += timedelta(seconds=random.randint(5, 15))

# PAM lockout
LOCKOUT_TIME = t
auth_lines.append(f"{ts(t)} server01 sshd[{random.randint(1000,9999)}]: "
                  f"pam_unix(sshd:auth): authentication failure; logname= uid=0 euid=0 "
                  f"tty=ssh ruser= rhost={ATTACKER_IP}  user={VICTIM_USER}\n")
t += timedelta(seconds=90)

# ── Phase 2: Successful login after wait ────────────────────────────────────
t += timedelta(minutes=2)   # attacker waits for lockout to reset
LOGIN_TIME = t
SESSION_ID = f"session-{random.randint(10000,99999)}"
auth_lines.append(f"{ts(t)} server01 sshd[{random.randint(1000,9999)}]: "
                  f"Accepted password for {VICTIM_USER} from {ATTACKER_IP} port {random.randint(30000,60000)} ssh2\n")
auth_lines.append(f"{ts(t)} server01 sshd[{random.randint(1000,9999)}]: "
                  f"pam_unix(sshd:session): session opened for user {VICTIM_USER} by (uid=0)\n")

# ── Phase 3: Data Exfiltration (app log) ────────────────────────────────────
app_events = []
t = LOGIN_TIME

# Recon: unusual API calls
for endpoint in ["/api/users/list", "/api/config/export", "/api/db/schema"]:
    t += timedelta(seconds=random.randint(15, 40))
    app_events.append({
        "timestamp": iso(t),
        "event_type": "api_access",
        "user_id": VICTIM_USER,
        "source_ip": ATTACKER_IP,
        "endpoint": endpoint,
        "method": "GET",
        "status_code": 200,
        "session_id": SESSION_ID,
        "bytes_sent": random.randint(200, 800)
    })

# Large data export
t += timedelta(seconds=60)
EXPORT_TIME = t
app_events.append({
    "timestamp": iso(t),
    "event_type": "data_export",
    "user_id": VICTIM_USER,
    "source_ip": ATTACKER_IP,
    "endpoint": "/api/records/export",
    "method": "POST",
    "status_code": 200,
    "session_id": SESSION_ID,
    "bytes_sent": 4_872_341,   # ~4.6 MB — suspicious
    "record_count": 48231,
    "export_format": "csv"
})

# Privilege escalation attempt
t += timedelta(seconds=30)
app_events.append({
    "timestamp": iso(t),
    "event_type": "privilege_escalation_attempt",
    "user_id": VICTIM_USER,
    "source_ip": ATTACKER_IP,
    "action": "sudo -l",
    "session_id": SESSION_ID,
    "success": False
})

# Session logout
t += timedelta(seconds=45)
LOGOUT_TIME = t
auth_lines.append(f"{ts(t)} server01 sshd[{random.randint(1000,9999)}]: "
                  f"pam_unix(sshd:session): session closed for user {VICTIM_USER}\n")
auth_lines.append(f"{ts(t)} server01 sshd[{random.randint(1000,9999)}]: "
                  f"Disconnected from {ATTACKER_IP} port {random.randint(30000,60000)} [preauth]\n")

# ── Write files ──────────────────────────────────────────────────────────────
AUTH_LOG.write_text("".join(auth_lines))
APP_LOG.write_text("\n".join(json.dumps(e) for e in app_events))

# ── Additional log types for multi-source reconstruction ─────────────────────
nginx_lines = [
    '10.0.0.5 - alice [15/Nov/2024:02:08:02 +0000] "GET /dashboard HTTP/1.1" 200 1842 "-" "Mozilla/5.0"\n',
    f'{ATTACKER_IP} - - [15/Nov/2024:02:21:49 +0000] "GET /api/users/list HTTP/1.1" 200 734 "-" "curl/8.4"\n',
    f'{ATTACKER_IP} - - [15/Nov/2024:02:22:25 +0000] "GET /api/config/export HTTP/1.1" 200 812 "-" "curl/8.4"\n',
    f'{ATTACKER_IP} - - [15/Nov/2024:02:23:56 +0000] "POST /api/records/export HTTP/1.1" 200 4872341 "-" "curl/8.4"\n',
    '198.51.100.23 - - [15/Nov/2024:02:24:05 +0000] "GET /wp-login.php HTTP/1.1" 404 123 "-" "masscan"\n',
]
NGINX_LOG.write_text("".join(nginx_lines))

fw_lines = [
    f"2024-11-15T02:09:44 edge-fw firewall: action=DENY src={ATTACKER_IP} dst=10.0.0.10 proto=TCP dpt=22\n",
    f"2024-11-15T02:09:47 edge-fw firewall: action=DENY src={ATTACKER_IP} dst=10.0.0.11 proto=TCP dpt=22\n",
    f"2024-11-15T02:09:51 edge-fw firewall: action=DENY src={ATTACKER_IP} dst=10.0.0.12 proto=TCP dpt=22\n",
    "2024-11-15T02:13:12 edge-fw firewall: action=ALLOW src=10.0.0.5 dst=10.0.0.20 proto=TCP dpt=443\n",
]
FIREWALL_LOG.write_text("".join(fw_lines))

cloud_events = [
    {
        "eventTime": "2024-11-15T02:26:10Z",
        "eventSource": "iam.amazonaws.com",
        "eventName": "CreateAccessKey",
        "awsRegion": "us-east-1",
        "sourceIPAddress": ATTACKER_IP,
        "userIdentity": {"type": "IAMUser", "userName": VICTIM_USER},
    },
    {
        "eventTime": "2024-11-15T02:26:40Z",
        "eventSource": "s3.amazonaws.com",
        "eventName": "PutBucketPolicy",
        "awsRegion": "us-east-1",
        "sourceIPAddress": ATTACKER_IP,
        "userIdentity": {"type": "IAMUser", "userName": VICTIM_USER},
    },
    {
        "eventTime": "2024-11-15T02:27:01Z",
        "eventSource": "ec2.amazonaws.com",
        "eventName": "DescribeInstances",
        "awsRegion": "us-east-1",
        "sourceIPAddress": "10.0.0.5",
        "userIdentity": {"type": "IAMUser", "userName": "alice"},
    },
]
CLOUD_LOG.write_text("\n".join(json.dumps(e) for e in cloud_events))

endpoint_lines = [
    f"2024-11-15T02:24:58 endpoint01 EDR malware alert user={VICTIM_USER} src={ATTACKER_IP} signature=SuspiciousSudoProbe severity=high",
    "2024-11-15T02:28:10 endpoint02 EDR blocked script user=alice src=10.0.0.5 reason=policy",
]
ENDPOINT_LOG.write_text("\n".join(endpoint_lines))

print(f"[+] Generated {len(auth_lines)} auth log lines → {AUTH_LOG}")
print(f"[+] Generated {len(app_events)} app events     → {APP_LOG}")
print(f"[+] Generated {len(nginx_lines)} nginx events   → {NGINX_LOG}")
print(f"[+] Generated {len(fw_lines)} firewall events → {FIREWALL_LOG}")
print(f"[+] Generated {len(cloud_events)} cloud events → {CLOUD_LOG}")
print(f"[+] Generated {len(endpoint_lines)} endpoint events → {ENDPOINT_LOG}")
print(f"\n  Attack window : {START_TIME.strftime('%H:%M')} – {LOGOUT_TIME.strftime('%H:%M')}")
print(f"  Brute-force   : {len([l for l in auth_lines if 'Failed' in l])} failed attempts")
print(f"  Attacker IP   : {ATTACKER_IP}")
print(f"  Data exported : 4.87 MB (48231 records)")
