# Anti Slop source

- Repository: https://github.com/dmmulroy/anti-slop
- Source commit: c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b
- Source directory: skills/install-anti-slop/assets/anti-slop
- Installed directory: frontend/tools/oxlint/anti-slop
- Installer: .agents/skills/install-anti-slop/scripts/install.mjs
- Intentional source deviations: none. Every copied asset was compared by SHA-256.
- Local configuration: frontend/.oxlintrc.json enables all generic rules; Effect rules are not enabled because Effect is not a direct dependency.
- Oxlint and @oxlint/plugins: both pinned to 1.87.0.
- Preserve vendor/eslint-stylistic/LICENSE and vendor/eslint-stylistic/UPSTREAM.md when updating.
- MIT license for the plugin: .agents/skills/install-anti-slop/LICENSE.

Use the installed skill's update procedure to preserve local changes during upgrades.
