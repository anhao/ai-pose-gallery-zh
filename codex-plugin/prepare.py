#!/usr/bin/env python3
"""Assemble a local plugin package from a complete checkout, without modifying it."""
import argparse
import shutil
from pathlib import Path

source = Path(__file__).resolve().parent
repo = source.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('destination', type=Path, help='new directory for the local marketplace')
args = parser.parse_args()
dest = args.destination.expanduser().resolve()
if dest.exists():
    parser.error('destination already exists; choose a new directory')
for name in ('data', 'img', 'thumbs', 'index.html', 'README.md', 'LICENSE'):
    if not (repo / name).exists():
        parser.error(f'missing {name}; use a complete repository checkout')
if source in dest.parents or dest in source.parents:
    parser.error('destination must be outside the source checkout')
shutil.copytree(source, dest, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
gallery = dest / 'gallery'
gallery.mkdir()
for name in ('data', 'img', 'thumbs'):
    shutil.copytree(repo / name, gallery / name)
for name in ('index.html', 'README.md', 'LICENSE'):
    shutil.copy2(repo / name, gallery / name)
print('Prepared:', dest)
