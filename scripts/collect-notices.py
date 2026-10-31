"""Preserve dependency declarations and upstream licence texts; no code execution.

Collect the locked macOS native runtime graph and installed Node packages. For
crates whose registry tarballs omit licence texts, --fetch permits reading the
same upstream Git revision recorded in .cargo_vcs_info.json. Cached evidence is
kept under third-party; build and release commands do not fetch it implicitly.
"""
import argparse
import hashlib
import io
import json
import re
import subprocess
import tarfile
import urllib.request
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "third-party"
PREFIXES = ("license", "licence", "copying", "copyright", "notice", "unlicense", "ofl")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        assert path.read_bytes() == data, f"Preserved evidence differs: {path}"
    else:
        with path.open("xb") as f:
            f.write(data)


def local_texts(root):
    files = [p for p in root.iterdir() if p.is_file() and p.name.lower().startswith(PREFIXES)]
    for subdir in ("LICENSES", "licenses"):
        if (root / subdir).is_dir():
            files.extend(p for p in (root / subdir).rglob("*") if p.is_file())
    return [(str(p.relative_to(root)), p.read_bytes()) for p in sorted(set(files))]


def upstream_texts(package, root, fetch):
    vcs_path = root / ".cargo_vcs_info.json"
    if vcs_path.exists():
        vcs = json.loads(vcs_path.read_text())
    else:
        assert package["name"] == "serial" and package["version"] == "0.4.0"
        # Annotated upstream v0.4.0 tag, resolved before preservation. Validate
        # its Rust source against the registry crate below, rather than infer
        # an absent registry VCS revision.
        vcs = {"git": {"sha1": "7ed6540c2789b7c7365cd7a89fcb7bac7c567de8"}, "path_in_vcs": "serial"}
    revision = vcs["git"]["sha1"]
    repository = package["repository"].removesuffix(".git").rstrip("/")
    assert repository.startswith("https://github.com/") and re.fullmatch(r"[0-9a-f]{40}", revision)
    slug = repository.removeprefix("https://github.com/")
    assert len(slug.split("/")) == 2
    cache = OUT / "upstream" / slug.replace("/", "_") / (revision + ".tar.gz")
    url = f"https://codeload.github.com/{slug}/tar.gz/{revision}"
    if not cache.exists():
        assert fetch, f"Missing pinned upstream evidence; run with --fetch: {package['name']}"
        request = urllib.request.Request(url, headers={"User-Agent": "Goblin-IDE-license-preservation"})
        with urllib.request.urlopen(request, timeout=60) as response:
            data = response.read(32 * 1024 * 1024 + 1)
        assert len(data) <= 32 * 1024 * 1024, "Upstream archive exceeds evidence bound"
        save(cache, data)
    data = cache.read_bytes()
    subtree = PurePosixPath(vcs.get("path_in_vcs", ""))
    parents = {str(subtree), *(str(p) for p in subtree.parents), "."}
    texts = []
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
        for member in archive:
            if not member.isfile() or member.size > 1024 * 1024:
                continue
            path = PurePosixPath(*PurePosixPath(member.name).parts[1:])
            if str(path.parent) in parents and path.name.lower().startswith(PREFIXES):
                content = archive.extractfile(member).read()
                texts.append((str(path), content))
        if not vcs_path.exists():
            for source in root.rglob("*.rs"):
                relative = PurePosixPath("serial") / source.relative_to(root).as_posix()
                member = next(m for m in archive.getmembers() if PurePosixPath(*PurePosixPath(m.name).parts[1:]) == relative)
                assert archive.extractfile(member).read() == source.read_bytes()
    evidence = {"url": url, "git_revision": revision, "archive_sha256": sha(data)}
    if not texts and package["name"] == "selectors" and package["license"] == "MPL-2.0":
        # selectors' pinned source carries the MPL notice in its Rust headers,
        # but omits the standard full text. Preserve those notices and the same
        # standard MPL 2.0 text shipped by the locked cssparser dependency.
        standard = root.parent / "cssparser-0.37.0" / "LICENSE"
        content = standard.read_bytes()
        assert b"Mozilla Public License Version 2.0" in content
        headers = []
        for source in sorted(root.rglob("*.rs")):
            headers.append(str(source.relative_to(root)) + "\n" + "\n".join(source.read_text().splitlines()[:12]))
        texts = [("MPL-2.0.txt", content), ("UPSTREAM_SOURCE_NOTICES.txt", ("\n\n".join(headers) + "\n").encode())]
        evidence["standard_license_text_source"] = {"crate": "cssparser", "version": "0.37.0", "path": "LICENSE", "sha256": sha(content)}
    assert texts, f"No pinned upstream licence texts found: {package['name']}"
    return texts, evidence


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fetch", action="store_true")
    args = parser.parse_args()
    metadata = json.loads(subprocess.check_output(
        ["cargo", "metadata", "--locked", "--offline", "--format-version", "1"], cwd=ROOT / "src-tauri"))
    tree = subprocess.check_output(
        ["cargo", "tree", "--locked", "--offline", "--target", "aarch64-apple-darwin", "--edges", "normal", "--prefix", "none", "--format", "{p}"], cwd=ROOT / "src-tauri", text=True)
    selected = set(re.findall(r"^(\S+) v(\S+)", tree, re.M))
    records = []
    for package in metadata["packages"]:
        if not package.get("source") or (package["name"], package["version"]) not in selected:
            continue
        root = Path(package["manifest_path"]).parent
        texts = local_texts(root)
        evidence = {"registry_source": package["source"]}
        if not texts:
            texts, pinned = upstream_texts(package, root, args.fetch)
            evidence.update(pinned)
        records.append(record("rust", package["name"], package["version"], package["license"], package.get("repository"), texts, evidence))
    node = {}
    for pattern in ("*/node_modules/*/package.json", "*/node_modules/@*/*/package.json"):
        for path in (ROOT / "node_modules/.pnpm").glob(pattern):
            package = json.loads(path.read_text())
            node[(package["name"], package["version"])] = (package, path.parent)
    excluded = []
    for (name, version), (package, root) in sorted(node.items()):
        texts = local_texts(root)
        if not texts and name in ("@tauri-apps/cli-darwin-arm64", "@esbuild/darwin-arm64", "@rollup/rollup-darwin-arm64"):
            excluded.append({"name": name, "version": version, "declared_license": package.get("license"), "reason": "Build-tool platform executable; not redistributed in the app."})
            continue
        assert texts, f"No installed Node licence text: {name}@{version}"
        records.append(record("node", name, version, package.get("license"), package.get("repository"), texts, {"package_json_sha256": sha((root / "package.json").read_bytes())}))
    document = {"schema": "goblin.ide.third-party-notices.v1", "scope": "Locked macOS arm64 normal Rust dependency graph plus installed locked Node packages (includes build dependencies; three nonredistributed build-tool executables excluded explicitly). Bundled engine notices are separate in public/goblin++/.", "excluded_build_executables": excluded, "packages": records}
    # The generated index can be refreshed deliberately; preserved licence evidence cannot.
    (OUT / "inventory.json").write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n")
    lines = ["# Goblin++ IDE dependency notices", "", document["scope"], "", "Original licence texts and source evidence are retained under `third-party/`.", "Package declarations below retain their upstream expressions; this inventory does not relicense third-party work.", "The Goblin++ engine has its own MIT licence and dependency notices under `public/goblin++/`.", ""]
    for p in records:
        lines.append(f"- **{p['ecosystem']} {p['name']} {p['version']}**: `{p['declared_license']}`; [preserved texts]({p['directory']}/).")
    (ROOT / "THIRD_PARTY_NOTICES.md").write_text("\n".join(lines) + "\n")
    print(json.dumps({"packages": len(records), "rust": sum(p["ecosystem"] == "rust" for p in records), "node": len(node)}))


def record(ecosystem, name, version, license_expression, repository, texts, evidence):
    assert license_expression, (name, version)
    directory = OUT / ecosystem / (name.replace("/", "__") + "-" + version)
    files = []
    for path, data in texts:
        relative = PurePosixPath(path)
        assert not relative.is_absolute() and ".." not in relative.parts
        dest = directory / str(relative)
        save(dest, data)
        files.append({"path": str(dest.relative_to(ROOT)), "sha256": sha(data)})
    return {"ecosystem": ecosystem, "name": name, "version": version, "declared_license": license_expression, "repository": repository, "directory": str(directory.relative_to(ROOT)), "licence_files": files, "source_evidence": evidence}


if __name__ == "__main__":
    main()
