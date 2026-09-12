# Publishing

Publish only after the local test suite passes and every public-facing link contains the real GitHub owner and repository.

## Prepare and verify the account

Use PowerShell from the repository root. Node.js 22 or newer and GitHub CLI (`gh`) are required.

```powershell
node --version
gh auth login --hostname github.com --git-protocol https --web
gh auth status --hostname github.com

$ExpectedOwner = 'billy30183'
$Profile = gh api user | ConvertFrom-Json
if ($Profile.type -ne 'User') { throw "Expected a personal GitHub account (type User), got $($Profile.type)." }
if ($Profile.login -ne $ExpectedOwner) { throw "Expected GitHub account $ExpectedOwner, got $($Profile.login)." }
$Owner = $Profile.login
$Repo = 'globgap'
$RepoUrl = "https://github.com/$Owner/$Repo"
$PagesUrl = "https://$($Owner.ToLower()).github.io/$Repo/"
$RepoUrl
$PagesUrl
```

The intended URLs are `https://github.com/billy30183/globgap` and `https://billy30183.github.io/globgap/`. The account was verified as type `User` and the repository name returned 404 on 2026-09-12; repeat the checks below immediately before creation because availability can change.

Check for a name collision before making any remote changes:

```powershell
gh repo view "$Owner/$Repo" --json nameWithOwner
if ($LASTEXITCODE -eq 0) { throw "$Owner/$Repo already exists; choose another name. Do not overwrite it." }
gh auth status --hostname github.com
```

`gh repo create` also refuses to replace an existing repository. Do not add flags or scripts that delete or reuse a colliding repository.

Use the printed `$RepoUrl` and `$PagesUrl` values to set the actual repository and live-site links in `README.md`. Replace the publication-pending text in `public/index.html` with a source link whose `href` is `$RepoUrl`. Search once more before committing:

```powershell
rg -n "pending|placeholder|example\.com|github\.com/[^/]+/globgap" README.md public src
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:browser
git status --short
```

Review the output, then make the final release commit:

```powershell
git add .
git commit -m "Prepare globgap v0.1.0"
$FinalSha = git rev-parse HEAD
```

## Create the public repository and deploy

Create the empty public repository without `--push`, enable GitHub Actions as the Pages source, then push the reviewed commit:

```powershell
gh repo create "$Owner/$Repo" --public --source . --remote origin
gh api --method POST "repos/$Owner/$Repo/pages" -f build_type=workflow
git push --set-upstream origin main
```

The `Pages` workflow reruns unit tests, the build, and Chromium browser tests before uploading only `dist`. Find and watch the run for the exact final commit:

```powershell
$RunId = gh run list --repo "$Owner/$Repo" --workflow pages.yml --branch main --commit $FinalSha --limit 1 --json databaseId --jq '.[0].databaseId'
if (-not $RunId) { throw "No Pages run found for $FinalSha." }
gh run watch $RunId --repo "$Owner/$Repo" --exit-status
```

Verify the deployed site itself with the browser suite. Tag and release only if the workflow and live test pass and `HEAD` is still the tested commit:

```powershell
$env:LIVE_URL = $PagesUrl
npm run test:browser
Remove-Item Env:LIVE_URL
if ((git rev-parse HEAD) -ne $FinalSha) { throw 'HEAD changed after the verified workflow run.' }
git tag --annotate v0.1.0 --message "v0.1.0"
git push origin v0.1.0
gh release create v0.1.0 --repo "$Owner/$Repo" --verify-tag --title "globgap v0.1.0" --generate-notes
```

The workflows pin official GitHub actions to full commits resolved from their official repositories on 2026-09-12: `actions/checkout` v4 (`11d5960a326750d5838078e36cf38b85af677262`), `actions/setup-node` v4 (`49933ea5288caeca8642d1e84afbd3f7d6820020`), `actions/upload-pages-artifact` v3 (`56afc609e74202658d3ffba0e8f6dda462b719fa`), and `actions/deploy-pages` v4 (`d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e`).
