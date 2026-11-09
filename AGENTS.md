# Development workflow

- Use Git for all changes. Inspect the current status before editing and preserve unrelated changes.
- Work on `codex/` branches unless the user requests a different branch.
- Commit each completed, verified change with a concise message describing the outcome. Do not amend or rewrite existing history unless requested.
- Use the local desktop development workflow for routine changes. Build a portable EXE only when the user requests a release or packaged executable.
- Keep generated output, test profiles, credentials, and downloaded tool archives out of Git. See `.gitignore` and `vendor/README.md`.
- Do not push or publish unless the user requests it.
