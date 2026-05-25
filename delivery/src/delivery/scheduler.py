import os
import sys

# Add src to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

from delivery.email_service import EmailService
from delivery.wecom_bot import WeComBot


def run_email_job():
    """Send daily email digest at 8:00 AM."""
    svc = EmailService()
    svc.send()


def run_wecom_morning():
    """Push morning digest to WeCom at 8:00 AM."""
    bot = WeComBot()
    svc = EmailService()
    articles = svc.fetch_top_content(limit=5)
    if articles:
        article_dicts = [
            {
                "title": a.title,
                "url": a.url,
                "summary": a.summary or "",
                "signal_strength": a.signal_strength or 0.0,
                "categories": list(a.categories) if a.categories else [],
            }
            for a in articles
        ]
        bot.send_digest(article_dicts)


def run_wecom_evening():
    """Push evening digest to WeCom at 6:00 PM."""
    run_wecom_morning()  # Same logic for now


if __name__ == "__main__":
    scheduler = BlockingScheduler()

    # Email digest: 8:00 AM daily
    scheduler.add_job(
        run_email_job,
        CronTrigger(hour=8, minute=0),
        id="email_digest",
        name="Daily Email Digest",
    )

    # WeCom morning: 8:00 AM daily
    scheduler.add_job(
        run_wecom_morning,
        CronTrigger(hour=8, minute=0),
        id="wecom_morning",
        name="WeCom Morning Digest",
    )

    # WeCom evening: 6:00 PM daily
    scheduler.add_job(
        run_wecom_evening,
        CronTrigger(hour=18, minute=0),
        id="wecom_evening",
        name="WeCom Evening Digest",
    )

    print("Scheduler started. Jobs:")
    print("  [email_digest]      Daily Email Digest     — 08:00")
    print("  [wecom_morning]     WeCom Morning Digest  — 08:00")
    print("  [wecom_evening]     WeCom Evening Digest  — 18:00")
    print()

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        print("Scheduler stopped.")