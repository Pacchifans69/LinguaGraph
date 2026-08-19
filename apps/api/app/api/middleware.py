"""HTTP request-body size enforcement (M0.3 human review finding B).

The frozen M0 contract (M0_PREIMPLEMENTATION_REPORT.md section 6) defines
``MAX_REQUEST_BODY_BYTES`` (default 4,000,000) as the raw HTTP request-body
limit, separate from ``MAX_TEXT_VERSION_CODEPOINTS`` (the canonical-text
limit enforced by ``app.text.canonical``).

This ASGI middleware enforces the limit on the ACTUAL received byte count:

- every ``http.request`` chunk is counted as it arrives, so an oversized
  body is rejected BEFORE the application buffers it unboundedly;
- enforcement does not rely on the ``Content-Length`` header;
- both ``application/json`` bodies (``request.json()``) and
  ``multipart/form-data`` bodies (``request.form()``) stream through the same
  guarded receive channel;
- the rejection uses the standard error envelope with the stable
  ``TEXT_TOO_LARGE`` code and HTTP 413 (the same code the canonical-text
  limit uses, per the accepted error contract).
"""

from __future__ import annotations

import json

from starlette.types import ASGIApp, Message, Receive, Scope, Send


class _BodyTooLarge(BaseException):
    """Internal signal: the request body exceeded the configured limit.

    Deliberately NOT an ``Exception`` subclass: the application registers a
    generic ``Exception`` handler (the 500 envelope), and FastAPI/Starlette
    exception wrappers catch ``Exception`` — if this signal derived from
    ``Exception`` it would be converted into a 500 response INSIDE the
    application stack and never reach this middleware. Deriving from
    ``BaseException`` makes it bypass every ``except Exception`` wrapper so
    the middleware always handles it directly.
    """


class RequestBodySizeLimitMiddleware:
    """Reject HTTP request bodies larger than ``max_bytes`` with 413.

    The middleware wraps the application with a guarded ``receive`` channel
    that counts actual received bytes. Once the limit is crossed it stops
    feeding the application (raising ``_BodyTooLarge``), drains the
    remainder of the request body so the connection stays well-formed, and
    returns the standard 413 error envelope.
    """

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        received = 0
        too_large = False
        # Whether the last received http.request chunk still has a body
        # after it (`more_body`). Used by the drain step: when the chunk that
        # crossed the limit already carried `more_body: False`, there is
        # nothing left to drain and a further `receive()` would block (the
        # transport only sends more messages when more body exists).
        last_more_body = True

        async def guarded_receive() -> Message:
            nonlocal received, too_large, last_more_body
            message = await receive()
            if message["type"] == "http.request":
                last_more_body = message.get("more_body", False)
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    too_large = True
                    raise _BodyTooLarge()
            return message

        async def guarded_send(message: Message) -> None:
            # Once the limit is crossed, swallow the application's ENTIRE
            # response (start AND body): the 413 below is authoritative.
            if too_large:
                return
            await send(message)

        try:
            await self.app(scope, guarded_receive, guarded_send)
        except _BodyTooLarge:
            await self._drain(receive, last_more_body)
            await self._send_too_large(send)
            return
        if too_large:
            await self._send_too_large(send)

    async def _drain(self, receive: Receive, more_expected: bool) -> None:
        """Consume the remainder of the rejected request body (or disconnect).

        Only reads further messages when the chunk that crossed the limit
        announced more body; otherwise the body is already fully consumed and
        a further ``receive()`` would block forever.
        """
        if not more_expected:
            return
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                break
            if not message.get("more_body", False):
                break

    async def _send_too_large(self, send: Send) -> None:
        payload = {
            "code": "TEXT_TOO_LARGE",
            "message": "request body exceeds the maximum allowed size",
            "details": {"max_body_bytes": self.max_bytes},
        }
        body = json.dumps(payload).encode("utf-8")
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode("ascii")),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})
