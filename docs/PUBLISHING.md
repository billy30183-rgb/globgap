# Publishing

`billy30183-rgb/globgap` already exists. Never recreate it, replace it, or force-push it. Run these commands in PowerShell from the repository root. Node.js 22 or newer and GitHub CLI (`gh`) are required.

Use this helper after native commands so any failure stops publication:

```powershell
$ErrorActionPreference = 'Stop'
function Assert-LastExitCode([string]$Step) {
  if ($LASTEXITCODE -ne 0) { throw "$Step failed with exit code $LASTEXITCODE." }
}
function Get-RemoteHeads {
  $Heads = @(git ls-remote --heads origin)
  Assert-LastExitCode 'Remote heads lookup'
  return $Heads
}
$Owner = 'billy30183-rgb'
$Repo = 'globgap'
$RepoUrl = 'https://github.com/billy30183-rgb/globgap'
$PagesUrl = 'https://billy30183-rgb.github.io/globgap/'
```

## Verify access and the existing repository

Refresh the workflow scope through GitHub's official flow, then verify the account and repository. Never paste a token into a script, issue, or log.

```powershell
gh auth refresh --hostname github.com --scopes workflow
Assert-LastExitCode 'GitHub authentication refresh'
gh auth status --hostname github.com
Assert-LastExitCode 'GitHub authentication check'

$Profile = gh api user | ConvertFrom-Json
Assert-LastExitCode 'GitHub profile lookup'
if ($Profile.type -ne 'User') { throw "Expected account type User, got $($Profile.type)." }
if ($Profile.login -ne $Owner) { throw "Expected GitHub account $Owner, got $($Profile.login)." }

$RemoteRepo = gh repo view "$Owner/$Repo" --json nameWithOwner,isPrivate,defaultBranchRef | ConvertFrom-Json
Assert-LastExitCode 'Existing repository lookup'
if ($RemoteRepo.nameWithOwner -ne "$Owner/$Repo") { throw 'Wrong repository.' }
if ($RemoteRepo.isPrivate) { throw 'Repository is not public.' }
if ($null -ne $RemoteRepo.defaultBranchRef -and $RemoteRepo.defaultBranchRef.name -ne 'main') {
  throw 'Default branch is not main.'
}
```

Inspect local state and fetch before changing or pushing anything. Stop if `main` has diverged or is behind the remote.

```powershell
git status --short
Assert-LastExitCode 'Working-tree inspection'
$Origin = git remote get-url origin
Assert-LastExitCode 'Origin lookup'
if ($Origin -notin @('https://github.com/billy30183-rgb/globgap.git', 'git@github.com:billy30183-rgb/globgap.git')) {
  throw "Unexpected origin: $Origin"
}
git fetch --prune origin
Assert-LastExitCode 'Fetch'

$Branch = git branch --show-current
Assert-LastExitCode 'Branch lookup'
if ($Branch -ne 'main') { throw "Expected branch main, got $Branch." }
$RemoteHeads = @(Get-RemoteHeads)
$RemoteMain = @($RemoteHeads | Where-Object { ($_ -split '\s+')[1] -eq 'refs/heads/main' })
if ($RemoteHeads.Count -gt 0 -and $RemoteMain.Count -ne 1) { throw 'Remote has heads but no unique main branch.' }
if ($RemoteMain.Count -eq 1) {
  $Counts = @(git rev-list --left-right --count HEAD...origin/main)
  Assert-LastExitCode 'Branch comparison'
  $Ahead, $Behind = ($Counts -join ' ').Trim() -split '\s+'
  if ([int]$Behind -ne 0) { throw "Local main is behind origin/main by $Behind commit(s). Stop and review." }
}
```

## Prepare and test the final commit

Update the README screenshot and its link before the final commit. Confirm that the README and UI use `$RepoUrl` and `$PagesUrl`, and that no publication placeholder remains. Review and stage only the intended release files.

```powershell
rg -n "pending|placeholder|example\.com|github\.com/[^/]+/globgap" README.md public src
if ($LASTEXITCODE -gt 1) { throw 'Link scan failed.' }
git status --short
Assert-LastExitCode 'Working-tree inspection'
git diff --check
Assert-LastExitCode 'Diff check'

npm ci
Assert-LastExitCode 'npm ci'
npm test
Assert-LastExitCode 'Unit tests'
npm run build
Assert-LastExitCode 'Build'
npx playwright install chromium
Assert-LastExitCode 'Chromium installation'
npm run test:browser
Assert-LastExitCode 'Local browser tests'

git add --patch
Assert-LastExitCode 'Interactive staging'
git status --short
Assert-LastExitCode 'Staged-file inspection'
git diff --cached --check
Assert-LastExitCode 'Staged diff check'
git commit -m "Prepare GlobGap v0.1.0"
Assert-LastExitCode 'Final commit'
$FinalSha = git rev-parse HEAD
Assert-LastExitCode 'Final commit lookup'
```

If the screenshot is new or binary, add its exact reviewed path explicitly before committing; do not use `git add .`.

Fetch and compare again immediately before a normal, non-force push:

```powershell
git fetch --prune origin
Assert-LastExitCode 'Final fetch'
$CurrentSha = git rev-parse HEAD
Assert-LastExitCode 'Pre-push HEAD lookup'
if ($CurrentSha -ne $FinalSha) { throw 'HEAD changed after final verification.' }
$RemoteHeads = @(Get-RemoteHeads)
$RemoteMain = @($RemoteHeads | Where-Object { ($_ -split '\s+')[1] -eq 'refs/heads/main' })
if ($RemoteHeads.Count -gt 0 -and $RemoteMain.Count -ne 1) { throw 'Remote has heads but no unique main branch.' }
if ($RemoteMain.Count -eq 1) {
  git merge-base --is-ancestor origin/main $FinalSha
  Assert-LastExitCode 'Fast-forward verification'
}
git push origin main
Assert-LastExitCode 'Main push'
```

## Verify Pages and the live site

The `Pages` workflow must test and build `$FinalSha`, upload only `dist`, and deploy only after its build job succeeds. Find the run for that exact commit, watch it, and inspect both required jobs:

```powershell
$RunId = $null
for ($Attempt = 0; $Attempt -lt 30 -and -not $RunId; $Attempt++) {
  $RunId = gh run list --repo "$Owner/$Repo" --workflow pages.yml --branch main --commit $FinalSha --limit 1 --json databaseId --jq '.[0].databaseId'
  Assert-LastExitCode 'Pages run lookup'
  if (-not $RunId) { Start-Sleep -Seconds 5 }
}
if (-not $RunId) { throw "No Pages run found for $FinalSha." }

gh run watch $RunId --repo "$Owner/$Repo" --exit-status
Assert-LastExitCode 'Pages workflow'
$Run = gh run view $RunId --repo "$Owner/$Repo" --json headSha,conclusion,jobs | ConvertFrom-Json
Assert-LastExitCode 'Pages workflow inspection'
if ($Run.headSha -ne $FinalSha -or $Run.conclusion -ne 'success') { throw 'The exact final commit did not pass Pages.' }
foreach ($JobName in @('build', 'deploy')) {
  $Job = @($Run.jobs | Where-Object name -eq $JobName)
  if ($Job.Count -ne 1 -or $Job[0].conclusion -ne 'success') { throw "Pages job $JobName did not succeed exactly once." }
}
```

Run the browser suite against the deployed site, then reverify local `HEAD`, remote `main`, and the successful workflow all identify the same commit:

```powershell
try {
  $env:LIVE_URL = $PagesUrl
  npm run test:browser
  Assert-LastExitCode 'Live browser tests'
} finally {
  Remove-Item Env:LIVE_URL -ErrorAction SilentlyContinue
}

$HeadSha = git rev-parse HEAD
Assert-LastExitCode 'HEAD recheck'
$RemoteSha = git ls-remote origin refs/heads/main | ForEach-Object { ($_ -split '\s+')[0] }
Assert-LastExitCode 'Remote main recheck'
$Run = gh run view $RunId --repo "$Owner/$Repo" --json headSha,conclusion | ConvertFrom-Json
Assert-LastExitCode 'Workflow recheck'
if ($HeadSha -ne $FinalSha -or $RemoteSha -ne $FinalSha -or $Run.headSha -ne $FinalSha -or $Run.conclusion -ne 'success') {
  throw 'Local, remote, and verified workflow commits do not match.'
}
```

## Tag and release v0.1.0

Inspect the local tag, remote tag, and GitHub release first. If any existing `v0.1.0` object is found, stop and inspect it; never move, delete, or overwrite it.

```powershell
$LocalTag = git tag --list v0.1.0
Assert-LastExitCode 'Local tag inspection'
$RemoteTag = git ls-remote --tags origin refs/tags/v0.1.0
Assert-LastExitCode 'Remote tag inspection'
$ExistingRelease = gh release view v0.1.0 --repo "$Owner/$Repo" --json tagName,url 2>$null
$ReleaseLookupExit = $LASTEXITCODE
if ($LocalTag -or $RemoteTag -or $ReleaseLookupExit -eq 0) {
  $ExistingRelease
  throw 'v0.1.0 already exists. Inspect it and do not overwrite it.'
}
gh auth status --hostname github.com
Assert-LastExitCode 'Authentication recheck after release lookup'
if (-not (Test-Path -LiteralPath docs/RELEASE_NOTES.md)) { throw 'docs/RELEASE_NOTES.md is missing.' }

$ReleaseNotesObject = "${FinalSha}:docs/RELEASE_NOTES.md"
git cat-file -e $ReleaseNotesObject
Assert-LastExitCode 'Committed release notes check'
git tag --annotate v0.1.0 $FinalSha --message "v0.1.0"
Assert-LastExitCode 'Tag creation'
git push origin v0.1.0
Assert-LastExitCode 'Tag push'
gh release create v0.1.0 --repo "$Owner/$Repo" --verify-tag --title "GlobGap v0.1.0" --notes-file docs/RELEASE_NOTES.md
Assert-LastExitCode 'GitHub release creation'
```

The workflows pin official GitHub actions to full commits resolved from their official repositories on 2026-09-12: `actions/checkout` v4 (`11d5960a326750d5838078e36cf38b85af677262`), `actions/setup-node` v4 (`49933ea5288caeca8642d1e84afbd3f7d6820020`), `actions/upload-pages-artifact` v3 (`56afc609e74202658d3ffba0e8f6dda462b719fa`), and `actions/deploy-pages` v4 (`d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e`).
