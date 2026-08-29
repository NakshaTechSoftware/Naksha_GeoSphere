"""Start the AI Agent Service as a background process."""
import subprocess, sys, os, time, signal

os.chdir(os.path.dirname(os.path.abspath(__file__)))
os.environ["TESTING"] = "1"

proc = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "app.main:app",
     "--host", "127.0.0.1", "--port", "8200", "--log-level", "info"],
    creationflags=getattr(subprocess, "DETACHED_PROCESS", 0),
    stdout=open("agent.log", "w"),
    stderr=subprocess.STDOUT,
)

# Write PID so we can stop it later
with open("agent.pid", "w") as f:
    f.write(str(proc.pid))

print(f"Agent service started (PID {proc.pid}) on http://127.0.0.1:8200")
print(f"Logs: agent.log")
print(f"Stop: python stop_agent.py")
