"""Stop the AI Agent Service."""
import os, signal

pid_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agent.pid")
if os.path.exists(pid_file):
    with open(pid_file) as f:
        pid = int(f.read().strip())
    try:
        os.kill(pid, signal.SIGTERM)
        print(f"Stopped agent service (PID {pid})")
    except ProcessLookupError:
        print(f"Process {pid} already stopped")
    os.remove(pid_file)
else:
    print("No agent.pid found — service may not be running")
