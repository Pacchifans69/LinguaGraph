"""AST-based Tier-A proof that the shadow source has no actuator boundary."""
from __future__ import annotations

import ast
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "lifecycle_controller"
EXCLUDED = {Path(__file__).resolve()}


def _trees() -> list[ast.AST]:
    trees: list[ast.AST] = []
    for path in sorted(SRC.rglob("*.py")):
        trees.append(ast.parse(path.read_text(encoding="utf-8"), filename=str(path)))
    return trees


def _call_name(node: ast.Call) -> str:
    if isinstance(node.func, ast.Name):
        return node.func.id
    if isinstance(node.func, ast.Attribute):
        return node.func.attr
    return "<dynamic>"


def main() -> int:
    trees = _trees()
    call_names = [_call_name(node) for tree in trees for node in ast.walk(tree) if isinstance(node, ast.Call)]
    dynamic = [name for name in call_names if name == "<dynamic>"]
    start_count = sum(name == "StartInstance" for name in call_names)
    stop_count = sum(name == "StopInstance" for name in call_names)
    lifecycle_send_names = {"send_lifecycle_mutation", "send_provider_mutation", "mutate_instance", "start_instance", "stop_instance"}
    provider_count = sum(name in lifecycle_send_names for name in call_names)
    closure_path = SRC / "closure.py"
    closure_tree = ast.parse(closure_path.read_text(encoding="utf-8"), filename=str(closure_path))
    verify_methods = [
        node for node in ast.walk(closure_tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == "verify_bound"
    ]
    verify_ok = len(verify_methods) == 1 and [arg.arg for arg in verify_methods[0].args.args] == ["self", "lifecycle_run_id"]
    intent_api = any(
        isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        and "append" in node.name.lower()
        and "mutation_intent" in node.name.lower()
        for tree in trees for node in ast.walk(tree)
    )
    print(f"StartInstance callsite count = {start_count}")
    print(f"StopInstance callsite count = {stop_count}")
    print(f"provider lifecycle mutation-send callsite count = {provider_count}")
    print(f"verify_bound caller signature = {'lifecycle_run_id only' if verify_ok else 'UNRESOLVED'}")
    print(f"authoritative MUTATION_INTENT append API = {'FOUND' if intent_api else 'NONE'}")
    if dynamic:
        print("unresolved dynamic call edges =", len(dynamic))
    if any((start_count, stop_count, provider_count)) or not verify_ok or intent_api or dynamic:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

