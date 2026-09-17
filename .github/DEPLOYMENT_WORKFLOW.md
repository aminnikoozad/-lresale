# Deployment workflow

Production safety rule for automated changes:

1. Make iterative changes on the `agent-work` branch, not `main`.
2. Let GitHub Actions run the full Build Check on `agent-work`.
3. Only after the final commit passes security tests, lint, typecheck and build, fast-forward `main` to that tested commit.
4. Vercel is configured to deploy only `main`; all other branches are disabled in `vercel.json`.

This prevents incomplete intermediate commits from triggering failed production deployments and duplicate failure emails.
