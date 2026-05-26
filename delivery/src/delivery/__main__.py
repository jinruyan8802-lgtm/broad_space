import argparse
import sys

from delivery.email_service import EmailService
from delivery.wecom_bot import WeComBot
from delivery.scheduler import DeliveryScheduler, run_email_job, run_wecom_job


def main():
    parser = argparse.ArgumentParser(description="BroadSpace Delivery Service")
    parser.add_argument(
        "--mode",
        choices=["email", "wecom", "scheduler"],
        default="scheduler",
        help="Run mode: email (one-shot), wecom (one-shot), or scheduler (daemon)",
    )
    args = parser.parse_args()

    if args.mode == "email":
        print("Sending email digest...")
        run_email_job()
    elif args.mode == "wecom":
        print("Sending WeCom digest...")
        run_wecom_job()
    elif args.mode == "scheduler":
        ds = DeliveryScheduler()
        ds.start()
        try:
            import time
            while True:
                time.sleep(1)
        except (KeyboardInterrupt, SystemExit):
            ds.stop()
            sys.exit(0)


if __name__ == "__main__":
    main()