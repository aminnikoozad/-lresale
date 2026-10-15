"""Run on the owner's machine: python setup.py --domain ai.example.com.

Generates a private gateway credential locally without printing it. Re-running
retains an existing credential; it never provisions cloud resources or billing.
"""
import argparse
import os
from pathlib import Path
import re
import secrets
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("--domain", required=True)
args = parser.parse_args()
if not re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?\.[a-z]{2,63}", args.domain):
    parser.error("Provide a hostname, without a scheme, port or path")
root = Path(__file__).resolve().parent
os.chdir(root)
subprocess.run(["docker", "compose", "version"], check=True)
env = root / ".env"
if not env.exists():
    fd = os.open(env, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as file:
        file.write(f"AI_DOMAIN={args.domain}\nSELF_HOSTED_AI_TOKEN={secrets.token_urlsafe(48)}\n")
elif f"AI_DOMAIN={args.domain}\n" not in env.read_text():
    raise SystemExit("Existing domain differs; review the local .env before changing it")
subprocess.run(["docker", "compose", "--profile", "install", "run", "--build", "--rm", "download"], check=True)
subprocess.run(["docker", "compose", "up", "--build", "-d", "llama", "inference", "tls"], check=True)
print("Services started. Check readiness, then configure the website server secrets as described in README.md. Your private token was not printed.")
