#!/usr/bin/env python3
"""Submit a local component folder as one new component version.

Usage:
    python submit_comp.py <folder containing comp.jsonc>

Works for both patterns (refer to /doc/service_workflow.md).
How to run the template examples: /doc/service_example.md.
- comp.jsonc has "source": {"dir": ...}  -> pattern 1, service builds
- comp.jsonc has "output": {"dir": ...}  -> pattern 2, upload prebuilt
"""

import base64
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path


def strip_jsonc(text: str) -> str:
    result = []
    i = 0
    is_in_string = False
    while i < len(text):
        ch = text[i]
        ch_next = text[i + 1] if i + 1 < len(text) else ""
        if is_in_string:
            result.append(ch)
            if ch == "\\" and ch_next:
                result.append(ch_next)
                i += 2
                continue
            if ch == '"':
                is_in_string = False
            i += 1
            continue
        if ch == '"':
            is_in_string = True
            result.append(ch)
            i += 1
            continue
        if ch == "/" and ch_next == "/":
            while i < len(text) and text[i] != "\n":
                i += 1
            continue
        if ch == "/" and ch_next == "*":
            i += 2
            while i + 1 < len(text) and not (text[i] == "*" and text[i + 1] == "/"):
                i += 1
            i += 2
            continue
        result.append(ch)
        i += 1
    return "".join(result)


def api_call(url_base: str, endpoint: str, body=None):
    url = url_base + endpoint
    if body is not None:
        req = urllib.request.Request(
            url,
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
    else:
        req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read().decode("utf-8"))
    if result.get("code") != 0:
        raise RuntimeError(f"{endpoint} failed: {result.get('message', 'unknown error')}")
    return result.get("data")


def collect_files(dir_abs: Path, dir_base_abs: Path):
    file_list = []
    for file_path in sorted(dir_abs.rglob("*")):
        if not file_path.is_file():
            continue
        rel = file_path.relative_to(dir_base_abs).as_posix()
        content = base64.b64encode(file_path.read_bytes()).decode("ascii")
        file_list.append({"path": rel, "contentBase64": content})
    return file_list


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    project_dir = Path(sys.argv[1]).resolve()
    desc = json.loads(strip_jsonc((project_dir / "comp.jsonc").read_text("utf-8")))
    url_base = desc["service"]["urlSubmit"].rstrip("/")

    # resolve compName -> compId, create component when missing
    comp_name = desc["compName"]
    try:
        comp = api_call(url_base, "/api/comp/find-by-name?compName=" + urllib.parse.quote(comp_name))
        comp_id = comp["compId"]
        print(f"component found: {comp_name} ({comp_id})")
    except Exception:
        created = api_call(url_base, "/api/comp/create", {
            "compName": comp_name,
            "metadata": {"schemaVersion": 1, "description": desc.get("metadata", {}).get("description", "")},
        })
        comp_id = created["compId"]
        print(f"component created: {comp_name} ({comp_id})")

    body = {"compId": comp_id, "metadata": desc["metadata"]}
    if desc.get("output", {}).get("dir"):
        # pattern 2: paths relative to the output dir itself
        output_dir = project_dir / desc["output"]["dir"]
        body["outputFileList"] = collect_files(output_dir, output_dir)
        print(f"submitting {len(body['outputFileList'])} prebuilt files from {desc['output']['dir']}/")
    elif desc.get("source", {}).get("dir"):
        # pattern 1: paths relative to the project folder (keep the dir prefix)
        source_dir = project_dir / desc["source"]["dir"]
        body["sourceFileList"] = collect_files(source_dir, project_dir)
        print(f"submitting {len(body['sourceFileList'])} source files from {desc['source']['dir']}/")
    else:
        raise RuntimeError("comp.jsonc must have source.dir or output.dir")

    created = api_call(url_base, "/api/comp/version/create", body)
    version_id = created["versionId"]
    print(f"version created: {version_id}")

    task_id = created.get("taskId")
    if task_id:
        print(f"build task: {task_id}, waiting...")
        message_last = ""
        while True:
            time.sleep(2)
            task = api_call(url_base, f"/api/task/get?taskId={task_id}")
            if task["taskStatusText"] != message_last:
                message_last = task["taskStatusText"]
                print(f"  [{task['taskStatus']}] {task['taskStatusText']}")
            if task["taskStatus"] != 1:
                if task["taskStatus"] != 2:
                    exit_message = (task.get("exitInfo") or {}).get("exitMessage", "")
                    print(f"build did not succeed: {exit_message}")
                    sys.exit(1)
                break

    print(f"done. resolve: {url_base}/api/comp/resolve?compId={comp_id}&versionId={version_id}")


if __name__ == "__main__":
    main()
