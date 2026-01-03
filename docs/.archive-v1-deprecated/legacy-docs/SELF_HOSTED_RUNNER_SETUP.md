# Self-Hosted GitHub Actions Runner Setup

This guide walks you through setting up a self-hosted GitHub Actions runner on your Windows machine so E2E tests can run against your local Docker containers (http://localhost:4001 backend, http://localhost:4000 frontend).

## Why Self-Hosted?

GitHub-hosted runners can't reach services running on your local machine. By installing a runner on your PC, workflows execute locally and can access your Docker containers directly—no public URLs or tunnels needed.

## Prerequisites

- Windows 10/11 with PowerShell
- Administrator access
- Docker containers running (backend on 4001, frontend on 4000)
- Your GitHub repository: https://github.com/andreibyf/aishacrm-2

## Step-by-Step Setup

### 1. Download the Runner

1. Go to your repository on GitHub: https://github.com/andreibyf/aishacrm-2
2. Click **Settings** → **Actions** → **Runners**
3. Click **New self-hosted runner**
4. Select **Windows** as the operating system
5. Select **x64** architecture
6. Download the runner package (or copy the download link shown)

### 2. Extract and Configure

Open PowerShell **as Administrator** and run:

```powershell
# Create a directory for the runner
New-Item -Path "C:\actions-runner" -ItemType Directory -Force
cd C:\actions-runner

# Download the runner (GitHub will show you the exact version URL)
# Example (use the actual link from GitHub Settings → Runners page):
Invoke-WebRequest -Uri https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-win-x64-2.311.0.zip -OutFile actions-runner-win-x64-2.311.0.zip

# Extract
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory("$PWD\actions-runner-win-x64-2.311.0.zip", "$PWD")

# Configure the runner with your repo
# GitHub will provide a unique token - use that instead of <TOKEN>
.\config.cmd --url https://github.com/andreibyf/aishacrm-2 --token <YOUR_REGISTRATION_TOKEN>
```

When prompted:
- **Runner name**: Press Enter to accept default or type something like `windows-dev`
- **Runner group**: Press Enter (uses default)
- **Labels**: Press Enter (will have `self-hosted, Windows, X64`)
- **Work folder**: Press Enter (uses `_work`)

### 3. Run the Runner

You have two options:

#### Option A: Run Interactively (for testing)

```powershell
.\run.cmd
```

Keep this PowerShell window open. The runner will listen for jobs and execute them.

**Pros**: Easy to see logs and test
**Cons**: Stops when you close the window or restart PC

#### Option B: Install as Windows Service (recommended)

```powershell
# Install the service (run as Administrator)
.\svc.cmd install

# Start the service
.\svc.cmd start

# Check status
.\svc.cmd status
```

**Pros**: Auto-starts on boot, runs in background
**Cons**: Logs are in Event Viewer instead of console

To stop the service later:
```powershell
.\svc.cmd stop
.\svc.cmd uninstall
```

### 4. Verify Runner is Online

1. Go back to GitHub: https://github.com/andreibyf/aishacrm-2/settings/actions/runners
2. You should see your runner listed with a green "Idle" status
3. If you see "Offline", check:
   - The runner process is still running (`.\run.cmd` window open or service is started)
   - Your internet connection is active
   - Windows Firewall isn't blocking the runner

## Workflow Configuration

The E2E workflow (`.github/workflows/e2e.yml`) has been updated to use `runs-on: self-hosted`.

When you trigger an E2E test:
- From the app (QA Console) or manually from GitHub Actions
- The workflow will run on your local runner
- Tests will target http://localhost:4001 (backend) and http://localhost:4000 (frontend)
- Your Docker containers must be running during the test

## Troubleshooting

### Runner says "Offline"
- Ensure the service is running: `.\svc.cmd status`
- Or restart the interactive runner: `.\run.cmd`
- Check Event Viewer → Windows Logs → Application for errors

### Tests fail with "ECONNREFUSED"
- Verify Docker containers are running:
  ```powershell
  docker compose ps
  ```
- Check backend health:
  ```powershell
  curl http://localhost:4001/health
  ```
- Check frontend:
  ```powershell
  curl http://localhost:4000/
  ```

### Playwright browser install fails
- The runner will auto-install Playwright browsers on first run
- If it fails, manually install in the runner directory:
  ```powershell
  cd C:\actions-runner\_work\aishacrm-2\aishacrm-2
  npx playwright install --with-deps
  ```

### Want to remove the runner?
```powershell
cd C:\actions-runner

# Stop and uninstall service (if installed)
.\svc.cmd stop
.\svc.cmd uninstall

# Remove from GitHub
.\config.cmd remove --token <YOUR_REMOVAL_TOKEN>

# Delete the directory
cd ..
Remove-Item -Recurse -Force C:\actions-runner
```

Get a removal token from GitHub Settings → Runners → click the runner → Remove.

## Security Notes

- The runner executes workflows from your repository. Only trusted collaborators should have push access.
- The runner has access to your Docker containers and local network.
- Keep the runner updated: GitHub will notify you of new versions in the runner UI.
- Use repository secrets for sensitive values (Supabase keys, tokens).

## Next Steps

1. Ensure your Docker containers are running (frontend 4000, backend 4001)
2. Trigger an E2E test from the app's QA Console
3. Watch the runner execute the workflow in the PowerShell window (or check GitHub Actions logs)
4. Tests should pass now that the runner can reach localhost

## Support

- GitHub Actions Runner docs: https://docs.github.com/en/actions/hosting-your-own-runners
- Issues with the runner: Check the GitHub repo Settings → Runners page for logs
- Issues with tests: Check Playwright reports uploaded as artifacts in GitHub Actions
