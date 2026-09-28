"""Download the BodyParts3D STL meshes a joint config needs (sparse, blobless git checkout).

    python pipeline/fetch_sources.py elbow

Meshes: BodyParts3D, © The Database Center for Life Science, CC BY-SA 2.1 JP
(via the STL mirror at github.com/Kevin-Mattheus-Moerman/BodyParts3D).
"""
import importlib
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))

REPO = 'https://github.com/Kevin-Mattheus-Moerman/BodyParts3D'
DEST = ROOT / 'sources' / 'bodyparts3d'
STL = 'assets/BodyParts3D_data/stl'


def run(*args, cwd=None):
    subprocess.run(args, cwd=cwd, check=True)


def main(joint: str):
    cfg = importlib.import_module(f'pipeline.joints.{joint}')
    ids = sorted({f for _, f, *_ in cfg.BONE_MESHES} | {f for _, f, _ in cfg.MUSCLES})
    repo = DEST / 'repo'
    if not (repo / '.git').exists():
        repo.parent.mkdir(parents=True, exist_ok=True)
        run('git', 'clone', '--depth', '1', '--filter=blob:none', '--no-checkout', REPO, str(repo))
        run('git', 'sparse-checkout', 'init', '--no-cone', cwd=repo)
    existing = subprocess.run(['git', 'sparse-checkout', 'list'], cwd=repo, capture_output=True, text=True).stdout.split()
    wanted = sorted(set(existing) | {f'/{STL}/{i}.stl' for i in ids})
    run('git', 'sparse-checkout', 'set', '--no-cone', *wanted, cwd=repo)
    run('git', 'checkout', cwd=repo)
    link = DEST / 'stl'
    if not link.exists():
        link.symlink_to(repo / STL)
    missing = [i for i in ids if not (link / f'{i}.stl').exists()]
    print(f'{len(ids) - len(missing)}/{len(ids)} meshes in {link}' + (f'; missing {missing}' if missing else ''))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'elbow')
