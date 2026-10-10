"""Isolated shell-script checks. Uses synthetic ENV and temporary age keys only."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SOURCE = Path("/source")
SOPS = "/sops"
AGE = "/age-keygen"

class ScriptChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="env-script-check-")
        self.base = Path(self.temp.name)
        self.root = self.base / "project"
        self.root.mkdir()
        shutil.copytree(SOURCE / "scripts", self.root / "scripts")
        for relative in ("compose.yml", "infra/nginx/default.conf", "infra/postgres/backup.sh", "infra/postgres/restore-check.sh"):
            target = self.root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(SOURCE / relative, target)
        for relative in ("backend/Dockerfile", "frontend/Dockerfile", "infra/pdf/Dockerfile"):
            target = self.root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("FROM scratch\n")
        self.db = self.base / "database"
        self.backup = self.base / "backups"
        self.db.mkdir()
        self.backup.mkdir()
        self.key = self.base / "key.agekey"  # Outside the test project.
        generated = subprocess.run([AGE, "-o", str(self.key)], capture_output=True, text=True, check=True)
        recipient = generated.stderr.strip().split()[-1]
        (self.root / ".sops.yaml").write_text(
            "creation_rules:\n  - path_regex: ^\\.env\\.(local|prod)\\.sops\\.env$\n    age: " + recipient + "\n"
        )
        self.mock = self.base / "bin"
        self.mock.mkdir()
        self.log = self.base / "calls.jsonl"
        runner = self.mock / "mock.py"
        runner.write_text('''
import json, os, sys
from pathlib import Path
args = sys.argv[2:]
if args == ["compose", "version"]:
    sys.exit(1 if os.getenv("MOCK_STANDALONE") else 0)
if args == ["version"]: sys.exit(0)
with open(os.environ["MOCK_DOCKER_LOG"], "a") as out: out.write(json.dumps(args) + "\\n")
if "--images" in args:
    print("registry.example.invalid/status-app:release-test")
elif "logs" in args:
    print("message fixture-password[$] and fixture-api-key")
if os.getenv("MOCK_FAIL") in args: sys.exit(1)
''')
        for name in ("docker", "docker-compose"):
            stub = self.mock / name
            stub.write_text(f'#!/bin/sh\nexec python3 "{runner}" "{name}" "$@"\n')
            stub.chmod(0o755)
        self.env = dict(os.environ, PATH=str(self.mock) + ":" + os.environ["PATH"],
                        SOPS_BIN=SOPS, SOPS_AGE_KEY_FILE=str(self.key), MOCK_DOCKER_LOG=str(self.log))
        self.values = dict(
            APP_ENV="prod", COMPOSE_PROFILES="runtime", APP_PORT="30165",
            APP_BIND_ADDRESS="127.0.0.1", APP_PUBLIC_URL="https://example.invalid",
            SESSION_COOKIE_SECURE="true", DB_DATA_DIR=str(self.db), BACKUP_DIR=str(self.backup),
            DB_PORT="30166", POSTGRES_DB="fixture", POSTGRES_USER="fixture",
            POSTGRES_PASSWORD="'fixture-password[$]'", POSTGRES_IMAGE="postgres:17", NGINX_IMAGE="nginx:stable-alpine",
            PLATFORM_BASE_URL="https://platform.example.invalid",
            PLATFORM_PROJECT_ID="11111111-1111-1111-1111-111111111111",
            PLATFORM_ENVIRONMENT_ID="22222222-2222-2222-2222-222222222222",
            PLATFORM_API_KEY="fixture-api-key", PLATFORM_FILE_RETENTION_CODE="fixture",
            PLATFORM_OIDC_ISSUER="https://platform.example.invalid/realm",
            PLATFORM_OIDC_CLIENT_ID="app", PLATFORM_OIDC_REDIRECT_URI="https://example.invalid/callback",
            OIDC_POST_LOGOUT_REDIRECT_URI="https://example.invalid/",
            ADMIN_OIDC_ISSUER="", ADMIN_OIDC_SUBJECT="",
            BACKEND_APP_IMAGE="registry.example.invalid/status-backend:release-test",
            FRONTEND_APP_IMAGE="registry.example.invalid/status-frontend:release-test",
            PDF_APP_IMAGE="registry.example.invalid/status-pdf:release-test",
            PROJECT_SOURCE_DIR=str(self.root), JAVA_IMAGE="eclipse-temurin:17",
            NODE_IMAGE="node:24", APP_IMAGE_PLATFORM="linux/amd64")
        self.save()

    def tearDown(self):
        self.temp.cleanup()

    def save(self, name="prod"):
        (self.root / (".env." + name)).write_text("".join(f"{key}={value}\n" for key, value in self.values.items()))

    def run_script(self, script, *args, ok=True, env=None):
        result = subprocess.run(["sh", str(self.root / "scripts" / script), *args],
                                cwd=self.root, env=env or self.env, capture_output=True, text=True)
        if ok:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        return result

    def calls(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def test_syntax(self):
        for script in (self.root / "scripts").glob("*.sh"):
            subprocess.run(["sh", "-n", str(script)], check=True)

    def test_real_sops_roundtrip_permissions(self):
        self.run_script("env.sh", "encrypt", "prod")
        cipher = (self.root / ".env.prod.sops.env").read_text()
        self.assertNotIn("fixture-api-key", cipher)
        self.assertNotIn("fixture-password[$]", cipher)
        self.run_script("env.sh", "decrypt", "prod")
        plain = self.root / ".env.prod"
        self.assertIn("fixture-api-key", plain.read_text())
        self.assertEqual(plain.stat().st_mode & 0o777, 0o600)
        self.assertFalse(list(self.root.glob("*.pending-*")))

    def test_wrong_key_preserves_target(self):
        self.run_script("env.sh", "encrypt", "prod")
        target = self.root / ".env.prod"
        before = target.read_bytes()
        other = self.base / "wrong.agekey"
        subprocess.run([AGE, "-o", str(other)], capture_output=True, check=True)
        env = dict(self.env, SOPS_AGE_KEY_FILE=str(other))
        self.run_script("env.sh", "decrypt", "prod", ok=False, env=env)
        self.assertEqual(target.read_bytes(), before)
        self.assertFalse(list(self.root.glob("*.pending-*")))

    def test_invalid_env_preserves_cipher(self):
        self.run_script("env.sh", "encrypt", "prod")
        target = self.root / ".env.prod.sops.env"
        before = target.read_bytes()
        self.values["ADMIN_OIDC_ISSUER"] = "https://example.invalid/realm"
        self.save()
        self.run_script("env.sh", "encrypt", "prod", ok=False)
        self.assertEqual(target.read_bytes(), before)

    def test_partial_sops_output_preserves_target(self):
        bad = self.mock / "bad-sops"
        bad.write_text('#!/bin/sh\nwhile [ "$#" -gt 0 ]; do if [ "$1" = --output ]; then shift; echo partial > "$1"; exit 1; fi; shift; done\n')
        bad.chmod(0o755)
        self.run_script("env.sh", "encrypt", "prod")
        target = self.root / ".env.prod"
        before = target.read_bytes()
        self.run_script("env.sh", "decrypt", "prod", ok=False, env=dict(self.env, SOPS_BIN=str(bad)))
        self.assertEqual(target.read_bytes(), before)
        self.assertFalse(list(self.root.glob("*.pending-*")))

    def test_shell_override_rejected(self):
        self.run_script("docker.sh", "validate", "prod", ok=False, env=dict(self.env, APP_PORT="9999"))
        self.assertFalse(self.calls())

    def test_missing_directory_stops_before_compose(self):
        self.values["DB_DATA_DIR"] = str(self.base / "missing")
        self.save()
        self.run_script("docker.sh", "up", "prod", ok=False)
        self.assertFalse(self.calls())

    def test_backup_inside_database_rejected(self):
        nested = self.db / "backup"
        nested.mkdir()
        self.values["BACKUP_DIR"] = str(nested)
        self.save()
        self.run_script("docker.sh", "validate", "prod", ok=False)

    def test_database_owned_by_container_user(self):
        self.base.chmod(0o777)
        self.db.chmod(0o700 if os.geteuid() == 0 else 0o000)
        try:
            result = subprocess.run(
                ["sh", str(self.root / "scripts/docker.sh"), "validate", "prod"],
                cwd=self.root, env=self.env, capture_output=True, text=True,
                **({"user": 65534, "group": 65534} if os.geteuid() == 0 else {}),
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(self.db.stat().st_mode & 0o777, 0o700 if os.geteuid() == 0 else 0)
        finally:
            self.db.chmod(0o700)

    def test_backup_symlink_inside_database_rejected(self):
        nested = self.db / "backup"
        nested.mkdir()
        alias = self.base / "backup-alias"
        alias.symlink_to(nested, target_is_directory=True)
        self.values["BACKUP_DIR"] = str(alias)
        self.save()
        self.run_script("docker.sh", "validate", "prod", ok=False)

    def test_database_symlink_with_separate_backup(self):
        alias = self.base / "database-alias"
        alias.symlink_to(self.db, target_is_directory=True)
        self.values["DB_DATA_DIR"] = str(alias)
        self.save()
        self.run_script("docker.sh", "validate", "prod")

    def test_plain_deploy_without_sops(self):
        env = dict(self.env, SOPS_BIN="/does-not-exist", SOPS_AGE_KEY_FILE="/does-not-exist")
        self.run_script("deploy.sh", "prod", "plain", env=env)
        calls = self.calls()
        self.assertLess(next(i for i,c in enumerate(calls) if "pull" in c), next(i for i,c in enumerate(calls) if "up" in c))
        up = next(c for c in calls if "up" in c)
        self.assertIn("--no-build", up)
        self.assertIn("--wait", up)
        self.assertFalse(any("build" in c for c in calls))

    def test_sops_deploy(self):
        self.run_script("env.sh", "encrypt", "prod")
        (self.root / ".env.prod").unlink()
        self.run_script("deploy.sh", "prod", "sops")
        self.assertTrue((self.root / ".env.prod").exists())
        self.assertTrue(any("up" in c for c in self.calls()))

    def test_deploy_requires_explicit_mode(self):
        self.run_script("deploy.sh", "prod", ok=False)
        self.assertFalse(self.calls())

    def test_pull_failure_prevents_up(self):
        self.run_script("deploy.sh", "prod", "plain", ok=False, env=dict(self.env, MOCK_FAIL="pull"))
        self.assertTrue(any("pull" in c for c in self.calls()))
        self.assertFalse(any("up" in c for c in self.calls()))

    def test_build_failure_prevents_push(self):
        self.run_script("build.sh", "build-push", "prod", ok=False, env=dict(self.env, MOCK_FAIL="build"))
        self.assertTrue(any("build" in c for c in self.calls()))
        self.assertFalse(any("push" in c for c in self.calls()))

    def test_build_push_order_profile(self):
        self.run_script("build.sh", "build-push", "prod")
        calls = self.calls()
        self.assertLess(next(i for i,c in enumerate(calls) if "build" in c), next(i for i,c in enumerate(calls) if "push" in c))
        self.assertTrue(all("--profile" in c and "package" in c for c in calls))

    def test_service_selection(self):
        self.run_script("docker.sh", "up", "prod", "backend-runtime")
        up = next(c for c in self.calls() if "up" in c)
        self.assertEqual(up[-1], "backend-runtime")
        self.assertNotIn("frontend-runtime", up)
        self.run_script("docker.sh", "up", "prod", "backend-image", ok=False)

    def test_standalone_compose(self):
        self.run_script("docker.sh", "validate", "prod", env=dict(self.env, MOCK_STANDALONE="1"))
        self.assertTrue(self.calls())
        self.assertFalse(any(c[0] == "compose" for c in self.calls()))

    def test_logs_redact_literal_values(self):
        result = self.run_script("docker.sh", "logs", "prod")
        self.assertIn("[REDACTED]", result.stdout)
        self.assertNotIn("fixture-api-key", result.stdout)
        self.assertNotIn("fixture-password[$]", result.stdout)

    def test_export_modes_allowlist(self):
        self.run_script("env.sh", "encrypt", "prod")
        base = set((self.root / "scripts/project.conf").read_text().split("RUNTIME_FILES=")[1].splitlines()[0].split())
        for mode in ("none", "plain", "sops"):
            before = set((self.root / ".runtime").glob("runtime-*")) if (self.root / ".runtime").exists() else set()
            self.run_script("export-runtime.sh", mode)
            bundle = (set((self.root / ".runtime").glob("runtime-*")) - before).pop()
            files = {str(p.relative_to(bundle)) for p in bundle.rglob("*") if p.is_file()}
            expected = base | ({"scripts/env.sh", ".sops.yaml", ".env.prod.sops.env"} if mode == "sops" else {".env.prod"} if mode == "plain" else set())
            self.assertEqual(files, expected)
            if mode == "plain": self.assertEqual((bundle / ".env.prod").stat().st_mode & 0o777, 0o600)
            self.assertFalse(any("build.sh" in p or p.endswith(".agekey") for p in files))

    def test_key_in_project_rejected(self):
        nested = self.root / "key.agekey"
        shutil.copyfile(self.key, nested)
        self.run_script("env.sh", "encrypt", "prod", ok=False, env=dict(self.env, SOPS_AGE_KEY_FILE=str(nested)))

    def test_mac_shasum_fallback(self):
        only = self.base / "mac-path"
        only.mkdir()
        for name in ("awk", "cat", "chmod", "dirname", "mktemp", "mv", "rm", "rmdir", "sh", "python3"):
            os.symlink(shutil.which(name), only / name)
        hasher = only / "shasum"
        hasher.write_text('#!/bin/sh\nexec python3 -c \'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())\' "$3"\n')
        hasher.chmod(0o755)
        env = dict(self.env, PATH=str(only))
        self.run_script("env.sh", "encrypt", "prod", env=env)
        self.run_script("env.sh", "decrypt", "prod", env=env)


    def test_source_change_preserves_cipher(self):
        self.run_script("env.sh", "encrypt", "prod")
        cipher = self.root / ".env.prod.sops.env"
        before = cipher.read_bytes()
        changer = self.mock / "change-sops"
        changer.write_text(f'#!/bin/sh\n"{SOPS}" "$@" || exit 1\necho "# changed during encryption" >> "{self.root / ".env.prod"}"\n')
        changer.chmod(0o755)
        self.run_script("env.sh", "encrypt", "prod", ok=False, env=dict(self.env, SOPS_BIN=str(changer)))
        self.assertEqual(cipher.read_bytes(), before)

    def test_sops_failure_prevents_deployment(self):
        self.run_script("deploy.sh", "prod", "sops", ok=False, env=dict(self.env, SOPS_BIN="/unavailable"))
        self.assertFalse(self.calls())

    def test_plaintext_exclusion_rule_rejected(self):
        self.run_script("env.sh", "encrypt", "prod")
        cipher = self.root / ".env.prod.sops.env"
        before = cipher.read_bytes()
        self.values["TEST_PLAINTEXT"] = "fixture-should-not-leak"
        policy = self.root / ".sops.yaml"
        policy.write_text(policy.read_text() + "    unencrypted_suffix: _PLAINTEXT\n")
        self.save()
        self.run_script("env.sh", "encrypt", "prod", ok=False)
        self.assertEqual(cipher.read_bytes(), before)

if __name__ == "__main__":
    unittest.main(verbosity=2)
