from worker.tasks.system import ping


def test_ping_reports_ready_status() -> None:
    result = ping.run()

    assert result["status"] == "ready"
    assert "worker" in result
    assert "timestamp" in result
