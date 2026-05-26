import os
import sys
import threading

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from delivery.email_service import EmailService
from delivery.wecom_bot import WeComBot
from delivery.health_server import HealthServer


class DeliveryScheduler:
    def __init__(self):
        self.scheduler = BackgroundScheduler()
        self.health_server = HealthServer(port=8081)
        self._health_thread: threading.Thread | None = None

    def _run_email_job(self):
        print("[scheduler] Running email digest job")
        try:
            svc = EmailService()
            svc.send()
        except Exception as e:
            print(f"[scheduler] Email job failed: {e}")

    def _run_wecom_job(self, label: str = "morning"):
        print(f"[scheduler] Running WeCom {label} job")
        try:
            bot = WeComBot()
            if not bot.webhook_url:
                print("[scheduler] WECOM_WEBHOOK_URL not set, skipping")
                return
            svc = EmailService()
            articles = svc.fetch_top_content(limit=5)
            if articles:
                bot.send_digest(articles)
        except Exception as e:
            print(f"[scheduler] WeCom job failed: {e}")

    def start(self):
        # Email digest: 8:00 AM daily
        self.scheduler.add_job(
            self._run_email_job,
            CronTrigger(hour=8, minute=0),
            id="email_digest",
            name="Daily Email Digest",
        )

        # WeCom morning: 8:00 AM daily
        self.scheduler.add_job(
            lambda: self._run_wecom_job("morning"),
            CronTrigger(hour=8, minute=0),
            id="wecom_morning",
            name="WeCom Morning Digest",
        )

        # WeCom evening: 6:00 PM daily
        self.scheduler.add_job(
            lambda: self._run_wecom_job("evening"),
            CronTrigger(hour=18, minute=0),
            id="wecom_evening",
            name="WeCom Evening Digest",
        )

        self.scheduler.start()

        # Start health check server in background thread
        self._health_thread = threading.Thread(target=self.health_server.start, daemon=True)
        self._health_thread.start()

        print("Scheduler started. Jobs:")
        print("  [email_digest]      Daily Email Digest     — 08:00")
        print("  [wecom_morning]     WeCom Morning Digest   — 08:00")
        print("  [wecom_evening]     WeCom Evening Digest   — 18:00")
        print("  Health check:       http://localhost:{}/health".format(self.health_server.port))
        print()

    def stop(self):
        self.scheduler.shutdown()
        self.health_server.shutdown()
        print("Scheduler stopped.")


def run_email_job():
    """One-shot email send (for CLI --mode email)."""
    svc = EmailService()
    svc.send()


def run_wecom_job():
    """One-shot WeCom push (for CLI --mode wecom)."""
    bot = WeComBot()
    svc = EmailService()
    articles = svc.fetch_top_content(limit=5)
    if articles:
        bot.send_digest(articles)


if __name__ == "__main__":
    ds = DeliveryScheduler()
    ds.start()
    try:
        import time
        while True:
            time.sleep(1)
    except (KeyboardInterrupt, SystemExit):
        ds.stop()