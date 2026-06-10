# Deploying to GitLab Pages

This repo ships with a ready-to-use `.gitlab-ci.yml` that builds the site and
publishes it to GitLab Pages on every push to the default branch. Like the
GitHub workflow, it installs dependencies **offline from the vendored
`wheels/`** (no PyPI access) and runs the full test suite before building —
a failing test keeps the previous version of the site live.

## One-time setup

1. **Create a project** on gitlab.com (or your self-managed instance):
   *New project → Create blank project*. Don't initialize it with a README.

2. **Push this repository:**

   ```bash
   git remote add gitlab git@gitlab.com:<your-username>/<project-name>.git
   git push -u gitlab main
   ```

   (Use `https://gitlab.com/...` instead if you prefer HTTPS auth. If GitLab
   is your only remote, name it `origin` instead of `gitlab`.)

3. **That's it.** There is no Pages toggle to flip — GitLab enables Pages
   automatically the first time a job named `pages` publishes a `public/`
   artifact. Watch the pipeline under **Build → Pipelines**; the first run
   takes a minute or two on the shared runners.

4. Find your URL under **Deploy → Pages** in the project sidebar. It will be:

   ```
   https://<your-username>.gitlab.io/<project-name>/
   ```

   > **Note:** on newer gitlab.com projects, "unique domain" is enabled by
   > default, which gives a URL like `https://<project>-<hash>.gitlab.io/`
   > instead. Both work — the CI derives the base path from `CI_PAGES_URL`,
   > so links are correct either way. You can disable the unique domain under
   > **Deploy → Pages → Use unique domain** if you prefer the classic URL.

## Day-to-day publishing

```bash
git add -A
git commit -m "Add notes on X"
git push gitlab main
```

Every push to the default branch rebuilds and redeploys. Notes are published
by tagging them `publish` (frontmatter `tags:` or inline `#publish`) — see
the README.

## Differences from GitHub Pages worth knowing

- **Private repos:** GitLab Pages works on private projects on the free tier,
  and you can restrict who can view the *site* under
  **Settings → General → Visibility → Pages** (GitHub requires a paid plan
  for private-repo Pages, and the site is always public).
- **Site title:** edit the `--title` argument in `.gitlab-ci.yml`
  (in `.github/workflows/deploy.yml` for GitHub).
- **User site:** if you name the project `<your-username>.gitlab.io`, the site
  is served from the domain root. The CI handles this automatically — the
  origin and base path are both derived from `CI_PAGES_URL`, so a user site
  (or unique domain) gets base path `/` without any edits.

## Pushing to both GitHub and GitLab

Both CI files coexist in the repo and ignore each other. To publish to both
hosts from one working copy:

```bash
git remote add gitlab git@gitlab.com:<you>/<project>.git
git push origin main && git push gitlab main
```

Or make one `git push` update both by adding a second push URL:

```bash
git remote set-url --add --push origin git@gitlab.com:<you>/<project>.git
git remote set-url --add --push origin git@github.com:<you>/<project>.git
```
