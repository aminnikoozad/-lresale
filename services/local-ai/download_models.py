"""Install-time downloads only. No inference provider account or API key required."""
import os
from pathlib import Path
import subprocess
import sys
from huggingface_hub import hf_hub_download, snapshot_download

root = Path(os.environ.get("MODEL_ROOT", "/models"))
root.mkdir(parents=True, exist_ok=True)
hf_hub_download("Qwen/Qwen3-8B-GGUF", "Qwen3-8B-Q4_K_M.gguf", local_dir=root / "llm")
snapshot_download("Systran/faster-whisper-small", local_dir=root / "whisper")
(root / "voices").mkdir(exist_ok=True)
for voice in ("en_US-lessac-medium", "fr_FR-siwis-medium"):
    subprocess.run([sys.executable, "-m", "piper.download_voices", voice], cwd=root / "voices", check=True)
print("Local model files ready. Start the inference services to verify them.")
