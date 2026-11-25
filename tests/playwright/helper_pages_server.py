import functools
import http.server
import sys


class PagesServer(http.server.ThreadingHTTPServer):
	request_queue_size = 64


def main(port: int, directory: str) -> None:
	handler = functools.partial(
		http.server.SimpleHTTPRequestHandler,
		directory=directory,
	)
	with PagesServer(("127.0.0.1", port), handler) as server:
		server.serve_forever()


if __name__ == "__main__":
	main(int(sys.argv[1]), sys.argv[2])
