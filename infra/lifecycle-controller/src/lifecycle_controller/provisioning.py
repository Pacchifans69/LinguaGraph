from __future__ import annotations

import ctypes
import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping
from uuid import uuid4

from .ledger import (
    LedgerAuthorityUnavailable,
    LedgerWriter,
    TransferredLedgerSession,
    WindowsMandatoryLock,
    _validate_event,
    validate_ledger_bytes,
)
from .models import Binding


@dataclass(frozen=True)
class FirstBindingRequest:
    """Human-supplied workflow facts; authority facts are not request inputs."""

    instance_id: str
    requesting_workflow: str
    workflow_run_identity: str

    def __post_init__(self) -> None:
        if not all(isinstance(value, str) and value for value in (
            self.instance_id, self.requesting_workflow, self.workflow_run_identity,
        )):
            raise ValueError("first binding request fields must be non-empty strings")


@dataclass(frozen=True)
class ControllerIdentity:
    controller_sid: str
    protected_instance_id: str

    def __post_init__(self) -> None:
        if not all(isinstance(value, str) and value for value in (
            self.controller_sid, self.protected_instance_id,
        )):
            raise ValueError("Controller host identity fields must be non-empty strings")


CONTROLLER_HOST_AUTHORITY_DESCRIPTOR = Path(
    r"C:\ProgramData\LinguaGraph\Controller\host-authority.json"
)


class ControllerProvisioningAuthority:
    """Typed result of a Controller-owned host authority check.

    This Python object is not an OS security capability. Production creation
    reads one fixed Controller-owned descriptor and obtains the current token
    SID itself; the descriptor's ACL/owner proof remains a Gate 2B claim.
    The object contains host identity data, not a transferable capability.
    Production provisioning never accepts a caller-created instance.
    """

    __slots__ = ("_identity",)

    def __init__(self, identity: ControllerIdentity):
        # This is inert identity data, not a capability. Production code never
        # accepts a caller-created authority object; its entry resolves host
        # authority internally before provisioning.
        self._identity = identity

    @staticmethod
    def from_controller_host() -> "ControllerProvisioningAuthority":
        """Read Controller-owned host facts and compare the current token SID."""
        identity = _load_controller_host_identity()
        current_sid = current_windows_sid()
        if current_sid != identity.controller_sid:
            raise LedgerAuthorityUnavailable("current Controller token SID does not match host authority")
        return ControllerProvisioningAuthority(identity)

    @property
    def identity(self) -> ControllerIdentity:
        return self._identity


class ProvisioningHandoff:
    """One-use typed transfer of the first-binding authority session."""

    __slots__ = ("writer", "_event", "binding", "_session", "_consumed", "_closed")

    def __init__(
        self,
        *,
        writer: LedgerWriter,
        event: dict[str, Any],
        binding: Binding,
        session: TransferredLedgerSession,
    ):
        self.writer = writer
        self._event = dict(event)
        self.binding = binding
        self._session = session
        self._consumed = False
        self._closed = False

    @property
    def event(self) -> Mapping[str, Any]:
        return dict(self._event)

    def __enter__(self) -> "ProvisioningHandoff":
        if self._closed:
            raise LedgerAuthorityUnavailable("provisioning handoff is closed")
        return self

    def __exit__(self, exc_type, exc, tb):
        self.abort()
        return False

    def consume(self, writer: LedgerWriter) -> None:
        if self._closed:
            raise LedgerAuthorityUnavailable("provisioning handoff is closed")
        if self._consumed:
            raise LedgerAuthorityUnavailable("provisioning handoff is one-use")
        if writer is not self.writer:
            raise LedgerAuthorityUnavailable("provisioning handoff writer mismatch")
        self._consumed = True

    def abort(self) -> None:
        if not self._consumed and not self._closed:
            self._session.abort_if_unclaimed()
            self._closed = True


def _load_controller_host_identity() -> ControllerIdentity:
    """Load fixed host configuration; ACL/owner proof is deferred to Gate 2B."""
    if sys.platform != "win32":
        raise LedgerAuthorityUnavailable("controller host authority requires Windows")
    try:
        payload = json.loads(CONTROLLER_HOST_AUTHORITY_DESCRIPTOR.read_text(encoding="utf-8"))
        return ControllerIdentity(
            controller_sid=payload["controller_sid"],
            protected_instance_id=payload["protected_instance_id"],
        )
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise LedgerAuthorityUnavailable("Controller host authority configuration unavailable") from exc


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def current_windows_sid() -> str:
    """Read the current process token SID without accepting an Agent boolean."""
    if sys.platform != "win32":
        raise LedgerAuthorityUnavailable("controller identity proof requires Windows")

    advapi32 = ctypes.WinDLL("advapi32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    token_query = 0x0008
    token_user = 1

    class SidAndAttributes(ctypes.Structure):
        _fields_ = [("Sid", ctypes.c_void_p), ("Attributes", ctypes.c_uint32)]

    class TokenUser(ctypes.Structure):
        _fields_ = [("User", SidAndAttributes)]

    token = ctypes.c_void_p()
    if not advapi32.OpenProcessToken(kernel32.GetCurrentProcess(), token_query, ctypes.byref(token)):
        raise LedgerAuthorityUnavailable("controller token could not be inspected")
    try:
        required = ctypes.c_uint32()
        advapi32.GetTokenInformation(token, token_user, None, 0, ctypes.byref(required))
        if required.value == 0:
            raise LedgerAuthorityUnavailable("controller token SID unavailable")
        buffer = ctypes.create_string_buffer(required.value)
        if not advapi32.GetTokenInformation(token, token_user, buffer, required, ctypes.byref(required)):
            raise LedgerAuthorityUnavailable("controller token SID unavailable")
        sid_ptr = ctypes.cast(buffer, ctypes.POINTER(TokenUser)).contents.User.Sid
        sid_text = ctypes.c_wchar_p()
        if not advapi32.ConvertSidToStringSidW(sid_ptr, ctypes.byref(sid_text)):
            raise LedgerAuthorityUnavailable("controller token SID unavailable")
        try:
            return sid_text.value
        finally:
            kernel32.LocalFree(sid_text)
    finally:
        kernel32.CloseHandle(token)


class LedgerProvisioner:
    """Sole production first-binding entry; host authority is resolved internally."""

    def __init__(self, path: Path):
        self.path = Path(path)
        self._poisoned = False

    def _ensure_healthy(self) -> None:
        if self._poisoned:
            raise LedgerAuthorityUnavailable(
                "initial provisioning authority is poisoned; Human review/cleanup required"
            )

    def _verify_identity(self, expected: tuple[int, int]) -> None:
        try:
            observed = os.stat(self.path, follow_symlinks=False)
        except OSError as exc:
            raise LedgerAuthorityUnavailable("canonical ledger path unavailable") from exc
        if (observed.st_dev, observed.st_ino) != expected:
            raise LedgerAuthorityUnavailable("canonical ledger path replaced during provisioning")

    @staticmethod
    def _read_descriptor_bytes(fd: int) -> bytes:
        try:
            os.lseek(fd, 0, os.SEEK_SET)
            chunks: list[bytes] = []
            while True:
                chunk = os.read(fd, 1024 * 1024)
                if not chunk:
                    return b"".join(chunks)
                chunks.append(chunk)
        except OSError as exc:
            raise LedgerAuthorityUnavailable("initial ledger validation read failed; FAIL_CLOSED") from exc

    def provision(self, request: FirstBindingRequest) -> ProvisioningHandoff:
        self._ensure_healthy()
        # This no-argument resolver is the only production authority path.
        identity = ControllerProvisioningAuthority.from_controller_host().identity
        if request.instance_id != identity.protected_instance_id:
            raise LedgerAuthorityUnavailable("instance_id is not the protected deployment instance")
        if not self.path.parent.is_dir():
            raise LedgerAuthorityUnavailable("canonical runtime directory is not provisioned")

        try:
            lock = WindowsMandatoryLock(self.path.with_suffix(".lock"))
        except Exception as exc:
            raise LedgerAuthorityUnavailable("LEDGER_SINGLE_WRITER_NOT_ENFORCEABLE") from exc
        if lock is None or not hasattr(lock, "__enter__"):
            raise LedgerAuthorityUnavailable("LEDGER_SINGLE_WRITER_NOT_ENFORCEABLE")
        entered = False
        transferred = False
        fd: int | None = None
        opened = False
        try:
            try:
                lock.__enter__()
                entered = True
            except Exception as exc:
                raise LedgerAuthorityUnavailable("LEDGER_SINGLE_WRITER_NOT_ENFORCEABLE") from exc

            if self.path.exists():
                raise LedgerAuthorityUnavailable("initial binding already exists")

            event = {
                "schema_version": 2,
                "event_type": "LIFECYCLE_RUN_BOUND",
                "event_seq": 0,
                "timestamp": _utc_now(),
                "lifecycle_run_id": str(uuid4()),
                "instance_id": request.instance_id,
                "requesting_workflow": request.requesting_workflow,
                "workflow_run_identity": request.workflow_run_identity,
            }
            _validate_event(event)
            payload = (self._json(event) + "\n").encode("utf-8")

            flags = os.O_RDWR | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0)
            try:
                fd = os.open(self.path, flags, 0o600)
                opened = True
            except FileExistsError as exc:
                raise LedgerAuthorityUnavailable("initial binding already exists") from exc
            except OSError as exc:
                self._poisoned = True
                raise LedgerAuthorityUnavailable("initial ledger creation failed; FAIL_CLOSED") from exc

            descriptor = os.stat(fd)
            expected_identity = (descriptor.st_dev, descriptor.st_ino)
            self._verify_identity(expected_identity)
            view = memoryview(payload)
            while view:
                count = os.write(fd, view)
                if count <= 0:
                    raise OSError("short initial ledger write")
                view = view[count:]
            os.fsync(fd)
            self._verify_identity(expected_identity)
            durable_bytes = self._read_descriptor_bytes(fd)
            if validate_ledger_bytes(durable_bytes) != [event]:
                raise LedgerAuthorityUnavailable(
                    "initial ledger durable bytes did not validate as the genuine event-0 binding"
                )
            self._verify_identity(expected_identity)

            binding = Binding(
                event["lifecycle_run_id"],
                event["instance_id"],
                event["requesting_workflow"],
                event["workflow_run_identity"],
                event["timestamp"],
            )
            session = TransferredLedgerSession(
                path=self.path,
                fd=fd,
                identity=expected_identity,
                session_bytes=durable_bytes,
                raw_lock=lock,
                close_func=os.close,
                path_stat_func=os.stat,
            )
            handoff = ProvisioningHandoff(
                writer=LedgerWriter(
                    self.path,
                    transferred_session=session,
                    close_func=os.close,
                ),
                event=event,
                binding=binding,
                session=session,
            )
            transferred = True
            fd = None
            return handoff
        except LedgerAuthorityUnavailable:
            if opened:
                self._poisoned = True
            raise
        except (OSError, UnicodeError) as exc:
            self._poisoned = True
            raise LedgerAuthorityUnavailable(
                "initial ledger write/flush failed; authority session poison; FAIL_CLOSED"
            ) from exc
        finally:
            try:
                if fd is not None:
                    os.close(fd)
            finally:
                if entered and not transferred:
                    lock.__exit__(None, None, None)

    @staticmethod
    def _json(event: dict[str, Any]) -> str:
        import json

        return json.dumps(event, sort_keys=True, separators=(",", ":"))
