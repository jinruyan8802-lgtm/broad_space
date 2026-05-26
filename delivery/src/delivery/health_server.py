import json
import os
from http.server import HTTPServer, BaseHTTPRequestHandler


class HealthHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Suppress default logging

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok"}).encode())
        else:
            self.send_response(404)
            self.end_headers()


class HealthServer:
    def __init__(self, port: int = None):
        port = port if port is not None else int(os.environ.get("DELIVERY_HEALTH_PORT", 8081))
        self.server = HTTPServer(("0.0.0.0", port), HealthHandler)
        self.port = port

    @property
    def server_address(self):
        return self.server.server_address

    def start(self):
        self.server.serve_forever()

    def shutdown(self):
        self.server.shutdown()
