"""Bounded, HTTPS-only, GET-only GitHub REST transport.

Credentials and network access are injected. Redirects are rejected, responses are
size-bounded, and rate-limit retries are finite. No write method is exposed.
"""
from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Mapping
from typing import Protocol

_API_ORIGIN = "https://api.github.com"
_API_VERSION = "2022-11-28"
_DEFAULT_TIMEOUT = 10.0
_MAX_TIMEOUT = 30.0
_DEFAULT_RESPONSE_BYTES = 6_000_000
_MAX_RESPONSE_BYTES = 10_000_000
_DEFAULT_RETRIES = 2
_MAX_RETRIES = 3
_MAX_RETRY_AFTER = 30.0


class GitHubTransportError(RuntimeError):
    """Sanitized transport failure; never includes credentials or response bodies."""


class _Response(Protocol):
    headers: Mapping[str, str]

    def read(self, amount: int = -1) -> bytes: ...

    def close(self) -> None: ...


class _Opener(Protocol):
    def open(self, request: urllib.request.Request, timeout: float) -> _Response: ...


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _default_opener() -> _Opener:
    return urllib.request.build_opener(_NoRedirectHandler())


class GitHubHTTPTransport:
    """Implements the adapter's narrow get_json(url) protocol."""

    def __init__(
        self,
        *,
        token_provider: Callable[[], str | None] | None = None,
        opener: _Opener | None = None,
        timeout_seconds: float = _DEFAULT_TIMEOUT,
        max_response_bytes: int = _DEFAULT_RESPONSE_BYTES,
        max_retries: int = _DEFAULT_RETRIES,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        if isinstance(timeout_seconds, bool) or not isinstance(timeout_seconds, (int, float)):
            raise ValueError("GITHUB_TIMEOUT_INVALID")
        if not 0 < timeout_seconds <= _MAX_TIMEOUT:
            raise ValueError("GITHUB_TIMEOUT_OUT_OF_RANGE")
        if isinstance(max_response_bytes, bool) or not isinstance(max_response_bytes, int):
            raise ValueError("GITHUB_RESPONSE_LIMIT_INVALID")
        if not 1 <= max_response_bytes <= _MAX_RESPONSE_BYTES:
            raise ValueError("GITHUB_RESPONSE_LIMIT_OUT_OF_RANGE")
        if isinstance(max_retries, bool) or not isinstance(max_retries, int):
            raise ValueError("GITHUB_RETRY_LIMIT_INVALID")
        if not 0 <= max_retries <= _MAX_RETRIES:
            raise ValueError("GITHUB_RETRY_LIMIT_OUT_OF_RANGE")
        self._token_provider = token_provider
        self._opener = opener or _default_opener()
        self._timeout = float(timeout_seconds)
        self._max_response_bytes = max_response_bytes
        self._max_retries = max_retries
        self._sleep = sleep

    def get_json(self, url: str) -> Mapping[str, object]:
        self._validate_url(url)
        token = self._read_token()
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": _API_VERSION,
            "User-Agent": "InfiniteX-ReadOnly-Object-Adapter",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"

        request = urllib.request.Request(url, headers=headers, method="GET")
        for attempt in range(self._max_retries + 1):
            try:
                response = self._opener.open(request, timeout=self._timeout)
                try:
                    return self._decode_response(response)
                finally:
                    response.close()
            except urllib.error.HTTPError as exc:
                try:
                    retry_delay = self._retry_delay(exc, attempt)
                finally:
                    exc.close()
                if retry_delay is None:
                    raise GitHubTransportError(self._http_error_code(exc.code)) from None
                self._sleep(retry_delay)
            except urllib.error.URLError:
                raise GitHubTransportError("GITHUB_NETWORK_REQUEST_FAILED") from None
            except TimeoutError:
                raise GitHubTransportError("GITHUB_REQUEST_TIMEOUT") from None
            except GitHubTransportError:
                raise
            except Exception:
                # Do not leak opener internals, headers, URLs, or credential values.
                raise GitHubTransportError("GITHUB_TRANSPORT_INTERNAL_ERROR") from None

        raise GitHubTransportError("GITHUB_RATE_LIMIT_RETRY_EXHAUSTED")

    @staticmethod
    def _validate_url(url: str) -> None:
        if not isinstance(url, str) or len(url) > 2048:
            raise GitHubTransportError("GITHUB_URL_INVALID")
        try:
            parsed = urllib.parse.urlsplit(url)
            # Reject encoded path delimiters and ambiguous URL forms before routing.
            if "%" in parsed.path:
                raise GitHubTransportError("GITHUB_URL_NOT_ALLOWLISTED")
            if (
                parsed.scheme != "https"
                or parsed.netloc != "api.github.com"
                or parsed.username is not None
                or parsed.password is not None
                or parsed.fragment
            ):
                raise GitHubTransportError("GITHUB_URL_NOT_ALLOWLISTED")
            match = re.fullmatch(
                r"/repos/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/git/(commits|trees|blobs)/[0-9a-f]{40}",
                parsed.path,
            )
            if match is None:
                raise GitHubTransportError("GITHUB_URL_PATH_NOT_ALLOWLISTED")
            if parsed.query == "":
                return
            if parsed.query == "recursive=1" and match.group(1) == "trees":
                return
            raise GitHubTransportError("GITHUB_QUERY_NOT_ALLOWLISTED")
        except ValueError:
            raise GitHubTransportError("GITHUB_URL_INVALID") from None

    def _read_token(self) -> str | None:
        if self._token_provider is None:
            return None
        try:
            token = self._token_provider()
        except Exception:
            raise GitHubTransportError("GITHUB_CREDENTIAL_PROVIDER_FAILED") from None
        if token is None or token == "":
            return None
        if not isinstance(token, str) or len(token) > 4096 or any(ch.isspace() for ch in token):
            raise GitHubTransportError("GITHUB_CREDENTIAL_INVALID")
        return token

    def _decode_response(self, response: _Response) -> Mapping[str, object]:
        status = getattr(response, "status", 200)
        if status != 200:
            raise GitHubTransportError("GITHUB_HTTP_STATUS_UNEXPECTED")
        length = response.headers.get("Content-Length")
        if length is not None:
            try:
                if int(length) < 0 or int(length) > self._max_response_bytes:
                    raise GitHubTransportError("GITHUB_RESPONSE_SIZE_LIMIT_EXCEEDED")
            except ValueError:
                raise GitHubTransportError("GITHUB_CONTENT_LENGTH_INVALID") from None
        content_type = response.headers.get("Content-Type", "")
        if "application/json" not in content_type.lower():
            raise GitHubTransportError("GITHUB_CONTENT_TYPE_UNSUPPORTED")
        body = response.read(self._max_response_bytes + 1)
        if len(body) > self._max_response_bytes:
            raise GitHubTransportError("GITHUB_RESPONSE_SIZE_LIMIT_EXCEEDED")
        try:
            payload = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise GitHubTransportError("GITHUB_JSON_RESPONSE_INVALID") from None
        if not isinstance(payload, dict):
            raise GitHubTransportError("GITHUB_JSON_OBJECT_REQUIRED")
        return payload

    def _retry_delay(self, error: urllib.error.HTTPError, attempt: int) -> float | None:
        if attempt >= self._max_retries:
            return None
        headers = error.headers or {}
        is_rate_limited = error.code == 429 or (
            error.code == 403 and headers.get("X-RateLimit-Remaining") == "0"
        )
        if not is_rate_limited:
            return None
        retry_after = headers.get("Retry-After")
        try:
            delay = float(retry_after) if retry_after is not None else min(2 ** attempt, 5)
        except (TypeError, ValueError):
            delay = min(2 ** attempt, 5)
        return max(0.0, min(delay, _MAX_RETRY_AFTER))

    @staticmethod
    def _http_error_code(status: int) -> str:
        if status in {301, 302, 303, 307, 308}:
            return "GITHUB_REDIRECT_REJECTED"
        if status == 401:
            return "GITHUB_AUTHENTICATION_FAILED"
        if status == 403:
            return "GITHUB_FORBIDDEN_OR_RATE_LIMITED"
        if status == 404:
            return "GITHUB_RESOURCE_NOT_FOUND"
        if status == 429:
            return "GITHUB_RATE_LIMITED"
        if 500 <= status <= 599:
            return "GITHUB_UPSTREAM_UNAVAILABLE"
        return "GITHUB_HTTP_REQUEST_FAILED"
