from unittest.mock import patch, MagicMock
import threading
import time
from delivery.scheduler import DeliveryScheduler


def test_scheduler_adds_jobs():
    with patch("delivery.scheduler.BackgroundScheduler") as MockScheduler, \
         patch("delivery.scheduler.HealthServer") as MockHealthServer:
        mock_sched = MagicMock()
        MockScheduler.return_value = mock_sched
        mock_health = MagicMock()
        MockHealthServer.return_value = mock_health

        ds = DeliveryScheduler()
        ds.start()

        assert mock_sched.add_job.call_count == 3
        mock_sched.start.assert_called_once()


def test_health_server_responds():
    from delivery.health_server import HealthServer
    import urllib.request

    server = HealthServer(port=0)  # auto-assign port
    thread = threading.Thread(target=server.start, daemon=True)
    thread.start()
    time.sleep(0.5)

    port = server.server_address[1]
    with urllib.request.urlopen(f"http://localhost:{port}/health") as resp:
        assert resp.status == 200
        body = resp.read().decode()
        assert "ok" in body

    server.shutdown()