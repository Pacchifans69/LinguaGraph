"""Conservative Tier-A boundary check for provider lifecycle mutation callables."""
from __future__ import annotations

import ast
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "lifecycle_controller"
MUTATION_NAMES = {
    "StartInstance", "StopInstance", "start_instance", "stop_instance",
    "send_lifecycle_mutation", "send_provider_mutation", "mutate_instance",
}
RECEIVER_NAMES = {"client", "provider", "ecs", "compute", "lifecycle_client"}
SAFE_DYNAMIC_TEST_SEAMS = {"lock_factory", "fsync_func", "order_hook"}
SAFE_NAMES = {
    "__build_class__", "__name__", "staticmethod", "classmethod", "property",
    "isinstance", "issubclass", "hasattr", "getattr", "setattr", "len", "str",
    "int", "bool", "bytes", "dict", "list", "tuple", "set", "frozenset",
    "sum", "any", "all", "enumerate", "sorted", "min", "max", "zip", "range",
    "type", "repr", "print", "super", "open", "iter", "next", "map", "filter",
    "object", "Exception", "RuntimeError", "ValueError", "OSError", "memoryview",
}


@dataclass(frozen=True)
class BoundaryAnalysis:
    start_instance_calls: int
    stop_instance_calls: int
    provider_lifecycle_mutation_send_callsite_count: int
    unresolved_relevant_edges: int
    violations: tuple[str, ...]


def _root_name(node: ast.AST) -> str | None:
    while isinstance(node, ast.Attribute):
        node = node.value
    return node.id if isinstance(node, ast.Name) else None


def analyze_source(source: str) -> BoundaryAnalysis:
    tree = ast.parse(source)
    definitions = {
        node.name for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
    }
    imported = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported.update(alias.asname or alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            imported.update(alias.asname or alias.name for alias in node.names if alias.name != "*")

    known_names = definitions | imported | SAFE_NAMES
    aliases: set[str] = set()
    violations: list[str] = []
    unresolved: set[tuple[int, str]] = set()
    start_calls = stop_calls = provider_calls = 0

    for parent in ast.walk(tree):
        for child in ast.iter_child_nodes(parent):
            child.parent = parent

    def direct_call(node: ast.AST) -> bool:
        parent = getattr(node, "parent", None)
        return isinstance(parent, ast.Call) and parent.func is node

    def static_callable_target(node: ast.AST) -> bool:
        if isinstance(node, ast.Name):
            return node.id in known_names
        if isinstance(node, ast.Attribute):
            return node.attr not in {"__getattribute__", "__dict__"} and static_attribute_target(node)
        return False

    def static_attribute_target(node: ast.AST) -> bool:
        while isinstance(node, ast.Attribute):
            if node.attr in {"__getattribute__", "__dict__"}:
                return False
            node = node.value
        if isinstance(node, (ast.Name, ast.Constant, ast.List, ast.Tuple, ast.Set, ast.Dict)):
            return True
        if isinstance(node, ast.Call):
            return static_callable_target(node.func)
        # A computed receiver is permitted only for ordinary syntax such as
        # pathlib's (root / name).read_bytes(); indirect subscripting and
        # conditional/lambda receivers are unresolved edges.
        if isinstance(node, ast.BinOp):
            return not any(isinstance(part, (ast.Subscript, ast.IfExp, ast.Lambda)) for part in ast.walk(node))
        return False

    def unresolved_edge(node: ast.AST, reason: str) -> None:
        unresolved.add((getattr(node, "lineno", 0), reason))
        violations.append(f"unresolved relevant edge at line {getattr(node, 'lineno', 0)}: {reason}")

    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            module = node.module or ""
            if any(word in module.lower() for word in ("provider", "cloud", "ecs", "compute")) or any(alias.name == "*" for alias in node.names):
                unresolved_edge(node, "provider import")
            for alias in node.names:
                if alias.name in MUTATION_NAMES:
                    aliases.add(alias.asname or alias.name)
                    unresolved_edge(node, "imported lifecycle mutation callable")
        elif isinstance(node, ast.Import):
            for alias in node.names:
                if any(word in alias.name.lower() for word in ("provider", "cloud", "ecs", "compute")):
                    unresolved_edge(node, "provider import")

        if isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Name):
                name = func.id
                if name == "StartInstance":
                    start_calls += 1
                    violations.append(f"StartInstance call at line {node.lineno}")
                elif name == "StopInstance":
                    stop_calls += 1
                    violations.append(f"StopInstance call at line {node.lineno}")
                if name in MUTATION_NAMES:
                    provider_calls += 1
                    if name not in {"StartInstance", "StopInstance"}:
                        violations.append(f"provider mutation wrapper call at line {node.lineno}")
                if name in aliases:
                    unresolved_edge(node, "aliased lifecycle mutation callable")
                elif name not in known_names:
                    unresolved_edge(node, f"unresolved callable name {name}")
                if name == "getattr" and direct_call(node):
                    # A lookup used as a callable target is outside this proof boundary.
                    unresolved_edge(node, "dynamic getattr callable lookup")
            elif isinstance(func, ast.Attribute):
                name = func.attr
                if name == "StartInstance":
                    start_calls += 1
                    violations.append(f"StartInstance call at line {node.lineno}")
                elif name == "StopInstance":
                    stop_calls += 1
                    violations.append(f"StopInstance call at line {node.lineno}")
                if name in MUTATION_NAMES:
                    provider_calls += 1
                    if name not in {"StartInstance", "StopInstance"}:
                        violations.append(f"provider mutation wrapper call at line {node.lineno}")
                if not static_attribute_target(func):
                    unresolved_edge(node, "computed or unresolved attribute call target")
                receiver = _root_name(func.value)
                if name == "__getattribute__":
                    unresolved_edge(node, "dynamic __getattribute__ dispatch")
                if receiver in RECEIVER_NAMES and any(token in name.lower() for token in ("start", "stop", "mutat", "lifecycle")):
                    unresolved_edge(node, "unresolved provider lifecycle attribute")
            else:
                unresolved_edge(node, f"dynamic call target {type(func).__name__}")

        if isinstance(node, ast.Attribute) and node.attr in MUTATION_NAMES and not direct_call(node):
            unresolved_edge(node, f"escaped lifecycle callable {node.attr}")
        if isinstance(node, ast.Name) and node.id in MUTATION_NAMES and not direct_call(node):
            unresolved_edge(node, f"escaped lifecycle callable {node.id}")
        if isinstance(node, ast.Attribute) and node.attr == "__dict__":
            unresolved_edge(node, "dynamic instance dictionary access")
        if isinstance(node, ast.Attribute) and node.attr == "__getattribute__":
            unresolved_edge(node, "dynamic attribute lookup")
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "getattr" and direct_call(node):
            unresolved_edge(node, "dynamic getattr lookup")

    return BoundaryAnalysis(
        start_instance_calls=start_calls,
        stop_instance_calls=stop_calls,
        provider_lifecycle_mutation_send_callsite_count=provider_calls,
        unresolved_relevant_edges=len(unresolved),
        violations=tuple(dict.fromkeys(violations)),
    )

def _production_analysis() -> BoundaryAnalysis:
    analyses = []
    for path in sorted(SRC.rglob("*.py")):
        analyses.append(analyze_source(path.read_text(encoding="utf-8")))
    return BoundaryAnalysis(
        sum(item.start_instance_calls for item in analyses),
        sum(item.stop_instance_calls for item in analyses),
        sum(item.provider_lifecycle_mutation_send_callsite_count for item in analyses),
        sum(item.unresolved_relevant_edges for item in analyses),
        tuple(v for item in analyses for v in item.violations),
    )


def main() -> int:
    result = _production_analysis()
    print(f"StartInstance callsite count = {result.start_instance_calls}")
    print(f"StopInstance callsite count = {result.stop_instance_calls}")
    print(f"provider lifecycle mutation-send callsite count = {result.provider_lifecycle_mutation_send_callsite_count}")
    print(f"unresolved relevant edges = {result.unresolved_relevant_edges}")
    closure_path = SRC / "closure.py"
    closure_tree = ast.parse(closure_path.read_text(encoding="utf-8"), filename=str(closure_path))
    verify_methods = [
        node for node in ast.walk(closure_tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == "verify_bound"
    ]
    verify_ok = len(verify_methods) == 1 and [arg.arg for arg in verify_methods[0].args.args] == ["self", "lifecycle_run_id"]
    print(f"verify_bound caller signature = {'lifecycle_run_id only' if verify_ok else 'UNRESOLVED'}")
    intent_api = any(
        isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        and "append" in node.name.lower() and "mutation_intent" in node.name.lower()
        for path in sorted(SRC.rglob("*.py"))
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8")))
    )
    print(f"authoritative MUTATION_INTENT append API = {'FOUND' if intent_api else 'NONE'}")
    if result.start_instance_calls or result.stop_instance_calls or result.provider_lifecycle_mutation_send_callsite_count or result.unresolved_relevant_edges or not verify_ok or intent_api:
        for violation in result.violations:
            print("boundary violation:", violation)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
