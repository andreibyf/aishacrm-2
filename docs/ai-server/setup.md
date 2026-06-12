# Local AI Inference Server Setup

> Part of the [AI Server docs](./README.md) — see also [models-and-routing](./models-and-routing.md), [workers-and-deploy](./workers-and-deploy.md), [monitor](./monitor.md).

**Hardware:** AMD Ryzen 7 9800X3D · RTX 5070 Ti (16 GB VRAM) · 32 GB RAM  
**Stack:** Ubuntu 24.04 LTS → NVIDIA Driver 572+ → CUDA 12.8 → vLLM (source build, Blackwell)

> **Why source build?** RTX 5070 Ti is Blackwell (sm_120). No pre-built PyTorch or vLLM wheels
> support sm_120 yet. All pip-install-only approaches silently fall back to CPU or fail outright.

---

## Phase 1 — Install Ubuntu 24.04 LTS

### 1.1 Create bootable USB (on Windows)

1. Download [Ubuntu 24.04 LTS ISO](https://releases.ubuntu.com/24.04/)
2. Download [Rufus](https://rufus.ie/) (portable, no install needed)
3. In Rufus: select the ISO → Partition scheme: **GPT** → Target system: **UEFI** → Write

### 1.2 BIOS prep

Boot into BIOS (DEL or F2 on most AM5 boards):

- Disable **Secure Boot** (simplifies NVIDIA driver signing — re-enable later if needed)
- Set boot order: USB first
- Save & reboot from USB

### 1.3 Install Ubuntu

- Choose **"Erase disk and install Ubuntu"** (wipes Windows)
- Select **Minimal installation** (no LibreOffice/games bloat)
- Enable **"Install third-party software for graphics"** — this pre-selects the open NVIDIA driver
- Set hostname, username, password → install → reboot

### 1.4 Post-install baseline

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y build-essential git curl wget python3-pip python3-venv \
  python3.12 python3.12-venv pkg-config cmake ninja-build ccache
```

---

## Phase 2 — NVIDIA Driver 572+ (Open Variant)

> Blackwell requires the **-open** driver. The legacy proprietary driver does not support sm_120.

### 2.1 Add NVIDIA CUDA repository

```bash
# Add CUDA keyring
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2404/x86_64/cuda-keyring_1.1-1_all.deb
sudo dpkg -i cuda-keyring_1.1-1_all.deb
sudo apt update
```

### 2.2 Install driver

```bash
# Install driver 570-open (latest stable supporting Blackwell at time of writing)
# Check for newer: apt-cache search nvidia-driver | grep open
sudo apt install -y nvidia-driver-570-open
sudo reboot
```

### 2.3 Verify

```bash
nvidia-smi
# Should show: RTX 5070 Ti | CUDA Version: 12.8 | driver 570.x or 572.x
```

If `nvidia-smi` shows `No devices found`:

```bash
# Check driver loaded
lsmod | grep nvidia
# If empty, nouveau is still active — blacklist it:
echo -e "blacklist nouveau\noptions nouveau modeset=0" | sudo tee /etc/modprobe.d/blacklist-nouveau.conf
sudo update-initramfs -u
sudo reboot
```

---

## Phase 3 — CUDA Toolkit 12.8

```bash
sudo apt install -y cuda-toolkit-12-8
```

Add CUDA to PATH — append to `~/.bashrc`:

```bash
echo 'export PATH=/usr/local/cuda-12.8/bin:$PATH' >> ~/.bashrc
echo 'export LD_LIBRARY_PATH=/usr/local/cuda-12.8/lib64:$LD_LIBRARY_PATH' >> ~/.bashrc
source ~/.bashrc
```

Verify:

```bash
nvcc --version
# Should show: release 12.8
```

---

## Phase 4 — vLLM from Source (Blackwell / sm_120)

> Pre-built vLLM wheels do not include sm_120 kernels. Source build is required.
> Total build time: ~25–40 min on 9800X3D.

### 4.1 Python virtual environment

```bash
python3.12 -m venv ~/vllm-env
source ~/vllm-env/bin/activate
pip install --upgrade pip uv
```

### 4.2 PyTorch nightly (cu128 — only version with sm_120 support)

```bash
pip install --pre torch --index-url https://download.pytorch.org/whl/nightly/cu128
# Installs: torch==2.9.0.dev*+cu128
```

Verify PyTorch sees the GPU:

```bash
python3 -c "import torch; print(torch.cuda.is_available()); print(torch.cuda.get_device_name(0))"
# Expected: True | NVIDIA GeForce RTX 5070 Ti
```

### 4.3 Build tools

```bash
pip install ninja cmake packaging setuptools-scm pyyaml
```

### 4.4 Clone and build vLLM

```bash
git clone https://github.com/vllm-project/vllm.git ~/vllm
cd ~/vllm

# Tell vLLM to use the PyTorch we already installed (critical step)
python use_existing_torch.py

pip install -r requirements/build.txt

# Build with Blackwell target
export VLLM_FLASH_ATTN_VERSION=2      # FA3 not supported on Blackwell yet
export TORCH_CUDA_ARCH_LIST="12.0"    # sm_120 = Blackwell
export CUDA_HOME=/usr/local/cuda-12.8
export MAX_JOBS=8                      # tune down to 4 if RAM pressure during build

pip install --no-build-isolation -e .
```

Verify:

```bash
vllm --version
# Should print a version string (no ImportError)
```

### 4.5 Download a model

```bash
pip install huggingface_hub
huggingface-cli login   # paste your HF token

# Recommended starting model for AiSHA tool-calling (fits in 16GB at Q4)
huggingface-cli download Qwen/Qwen2.5-14B-Instruct-GGUF \
  --local-dir /models/Qwen2.5-14B-Instruct --local-dir-use-symlinks False
```

---

## Phase 5 — Run vLLM as Production Service

### 5.1 Test launch

```bash
source ~/vllm-env/bin/activate

python -m vllm.entrypoints.openai.api_server \
  --model /models/Qwen2.5-14B-Instruct \
  --host 0.0.0.0 \
  --port 8000 \
  --gpu-memory-utilization 0.90 \
  --enable-chunked-prefill \
  --enable-prefix-caching \
  --max-model-len 16384
```

Smoke test:

```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "/models/Qwen2.5-14B-Instruct",
    "messages": [{"role":"user","content":"ping"}],
    "max_tokens": 10
  }'
```

### 5.2 Systemd service (production)

```bash
sudo tee /etc/systemd/system/vllm.service << 'EOF'
[Unit]
Description=vLLM Inference Server
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
Environment="PATH=/home/YOUR_USERNAME/vllm-env/bin:/usr/local/cuda-12.8/bin:/usr/bin:/bin"
Environment="LD_LIBRARY_PATH=/usr/local/cuda-12.8/lib64"
Environment="VLLM_FLASH_ATTN_VERSION=2"
Environment="TORCH_CUDA_ARCH_LIST=12.0"
ExecStart=/home/YOUR_USERNAME/vllm-env/bin/python -m vllm.entrypoints.openai.api_server \
  --model /models/Qwen2.5-14B-Instruct \
  --host 0.0.0.0 \
  --port 8000 \
  --gpu-memory-utilization 0.90 \
  --enable-chunked-prefill \
  --enable-prefix-caching \
  --max-model-len 16384
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Replace YOUR_USERNAME
sudo sed -i "s/YOUR_USERNAME/$USER/g" /etc/systemd/system/vllm.service

sudo systemctl daemon-reload
sudo systemctl enable vllm
sudo systemctl start vllm
sudo systemctl status vllm
```

---

## Phase 6 — Network Integration (Tailscale)

The AI server sits on a private LAN. All environments access it via Tailscale.

### Tailscale network

| Machine         | Hostname          | Tailscale IP     |
| --------------- | ----------------- | ---------------- |
| AI Cloud Server | `ai-cloud-server` | `100.81.132.118` |
| Hetzner (prod)  | `hetzner-prod`    | `100.105.182.29` |
| VPS-1 (staging) | `vps1-staging`    | `100.78.61.119`  |

Auth key: stored as `TAILSCALE_CLIENT_ID` / `TAILSCALE_CLIENT_SECRET` in `.env` (reusable key, expires Aug 27 2026).

To re-join a machine:

```bash
sudo tailscale up --auth-key=<key-from-tailscale-admin> --hostname=<hostname>
```

### Doppler configuration

Each environment points to the AI server via:

| Config         | `LOCAL_LLM_BASE_URL`            | Notes                            |
| -------------- | ------------------------------- | -------------------------------- |
| `dev_personal` | `http://192.168.7.219:8000/v1`  | Direct LAN — no Tailscale needed |
| `stg_stg`      | `http://100.81.132.118:8000/v1` | Via Tailscale                    |
| `prd_prd`      | `http://100.81.132.118:8000/v1` | Via Tailscale                    |

`LOCAL_LLM_API_KEY` and `SUMMARY_LLM_PROVIDER=local` / `SUMMARY_LLM_MODEL` are set in all three configs.

The **lite tier** (see Phase 6.5) adds `LOCAL_LLM_OLLAMA_BASE_URL`, consumed by the `aisha-task-lite` LiteLLM alias:

| Config         | `LOCAL_LLM_OLLAMA_BASE_URL`     | Notes                                     |
| -------------- | ------------------------------- | ----------------------------------------- |
| `dev_personal` | `http://192.168.7.219:11434`    | Direct LAN — Ollama on the AI server      |
| `stg_stg` / `prd_prd` | _(not set yet)_          | Use `http://100.81.132.118:11434` if/when the lite tier is enabled in those envs |

### Provider routing in AiSHA

The `local` provider in `backend/lib/aiEngine/` reads `LOCAL_LLM_BASE_URL` and `LOCAL_LLM_API_KEY` directly. Currently routed to the AI server:

| Capability              | Doppler key                                  | Current value       |
| ----------------------- | -------------------------------------------- | ------------------- |
| Customer data summaries | `SUMMARY_LLM_PROVIDER` + `SUMMARY_LLM_MODEL` | local / Qwen2.5-14B |

Tool-calling capabilities (`MODEL_CHAT_TOOLS`, `MODEL_BRAIN_PLAN_ACTIONS`) remain on OpenAI/Anthropic. Adding per-capability provider keys to `modelRouter.js` is the path to routing more capabilities to the AI server.

## Phase 6.5 — Lite tier (CPU / Ollama) for low-tool agents

The GPU is saturated by vLLM (Qwen2.5-14B uses ~14.8 of 16 GB VRAM), so the **lite tier runs entirely on the CPU via Ollama _on this same machine_** — fast enough for background/low-tool agent tasks while leaving the GPU free for the full tier.

> **Architecture rule:** Ollama runs **on the AI server** (this box), reached over the network by IP — exactly like vLLM. It is **NOT** a `docker-compose` service. The CRM compose stack runs on VPS/Hetzner/laptop, so an `ollama:11434` compose service would put the small models on the wrong machine. Reach it at `192.168.7.219:11434` (LAN) / `100.81.132.118:11434` (Tailscale).

### 6.5.1 Install Ollama + pull the lite model

```bash
curl -fsSL https://ollama.com/install.sh | sh   # installs the systemd ollama.service
ollama pull qwen2.5:3b                           # ~1.9 GB, general instruct, tool-calling
```

### 6.5.2 Force CPU-only + LAN bind (critical — must not contend with vLLM)

Two systemd drop-ins under `/etc/systemd/system/ollama.service.d/`:

```ini
# override.conf — listen on the LAN, not just localhost
[Service]
Environment="OLLAMA_HOST=0.0.0.0"

# cpu-only.conf — hide the GPU so Ollama never evicts vLLM from VRAM
[Service]
Environment="CUDA_VISIBLE_DEVICES="
```

```bash
sudo systemctl daemon-reload && sudo systemctl restart ollama
```

Verify the model loads on CPU and vLLM's VRAM is untouched:

```bash
curl -s localhost:11434/api/chat -d '{"model":"qwen2.5:3b","stream":false,"messages":[{"role":"user","content":"hi"}]}' >/dev/null
ollama ps          # PROCESSOR column must read "100% CPU"
nvidia-smi --query-gpu=memory.used --format=csv,noheader   # unchanged (~14.8 GB = vLLM only)
```

### 6.5.3 How AiSHA routes to it

- **LiteLLM** (`litellm_config.yaml`): the `aisha-task-lite` alias → `ollama_chat/qwen2.5:3b` at `os.environ/LOCAL_LLM_OLLAMA_BASE_URL`, with a fallback to `aisha-task` (GPU) then groq — so a slow/down Ollama degrades, never hard-fails.
- **Agent routing** (`backend/lib/agents/agentRegistry.js`): each role carries `metadata.model_tier` (`'lite' | 'full'`). `backend/workers/taskWorkers.js` picks `aisha-task-lite` for `lite`, else `aisha-task`.
- **Tier assignment:** default is conservative — only `customer_service_manager` is `lite`; everything else is `full`. Flip any role without a code change via `AISHA_<ROLE>_MODEL_TIER=lite|full` (e.g. `AISHA_OPS_MODEL_TIER`, `AISHA_CS_MODEL_TIER`), or set all roles with `AISHA_DEFAULT_MODEL_TIER`. Per-role env wins over the global default. Widen the lite set only after measuring tool-call accuracy on the 3B CPU model.

## Phase 7 — Known Patches (Blackwell sm_120 workarounds)

Two patches are applied in-place on the server to work around driver 570 + Blackwell incompatibilities. **Do not run `pip install triton` or rebuild vLLM without re-applying these.**

### Patch 1: Triton ptxas-blackwell bypass

**File:** `/home/aisha/vllm-env/lib/python3.12/site-packages/triton/backends/nvidia/compiler.py`

**Problem:** The bundled `ptxas-blackwell` binary is CUDA 13.1. Driver 570 only supports up to CUDA 12.8, so the compiled CUBIN fails to load with "device kernel image is invalid".

**Patch:**

```python
# Line ~34 — change:
return knobs.nvidia.ptxas_blackwell if arch >= 100 else knobs.nvidia.ptxas
# to:
return knobs.nvidia.ptxas  # Use system CUDA 12.8 ptxas; ptxas-blackwell (CUDA 13.1) needs driver 575+
```

Also on line ~97:

```python
# Change:
suffix = "a" if capability >= 90 else ""
# to:
suffix = "a" if capability == 90 else ""  # Blackwell sm_120 needs no 'a' suffix
```

### Patch 2: vLLM namespace package fix

**File:** `/home/aisha/vllm-env/lib/python3.12/site-packages/vllm-src.pth`

**Content:** `/home/aisha/vllm`

**Problem:** Python loads `vllm` as a namespace package from the repo root instead of from the editable install, causing `SamplingParams` import failures.

### When driver 575+ is available

Once the NVIDIA driver is upgraded to 575+:

1. Remove the `ptxas` patch (revert to `ptxas_blackwell if arch >= 100`)
2. Re-enable `--enable-chunked-prefill` (currently on)
3. Remove `--enforce-eager` flag for full torch.compile performance
4. Consider switching from `awq_marlin` back to AWQ if performance differs

---

## Troubleshooting

| Symptom                                    | Fix                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| `invalid device function`                  | `TORCH_CUDA_ARCH_LIST` not set to `12.0` during build — rebuild                   |
| `Total VRAM: 0 B` or falls back to CPU     | Wrong driver (non-open variant) or nouveau still active                           |
| OOM at model load                          | Lower `--gpu-memory-utilization` to `0.80` or add `--cpu-offload-gb 4`            |
| `use_existing_torch.py not found`          | You're on an old vLLM commit — `git pull` first                                   |
| Build OOM (RAM)                            | Lower `MAX_JOBS` to `4`                                                           |
| `ImportError: _C.abi3.so undefined symbol` | PyTorch/vLLM version mismatch — `pip install --pre torch` again then rebuild vLLM |

---

## Model Sizing Reference (16 GB VRAM)

| Model                | Quantization | VRAM   | Fits?                                |
| -------------------- | ------------ | ------ | ------------------------------------ |
| Qwen2.5-7B-Instruct  | BF16         | ~14 GB | ✅                                   |
| Qwen2.5-14B-Instruct | Q4           | ~8 GB  | ✅ (headroom for KV cache)           |
| Qwen2.5-32B-Instruct | Q4           | ~18 GB | ⚠️ tight, needs `--cpu-offload-gb 4` |
| Llama-3.1-70B        | Q4           | ~40 GB | ❌ too large                         |
| DeepSeek-R1-7B       | FP4          | ~4 GB  | ✅                                   |

**Recommended for AiSHA tool-calling:** `Qwen2.5-14B-Instruct` Q4 — best balance of capability and throughput (~60–80 tok/s on RTX 5070 Ti).
