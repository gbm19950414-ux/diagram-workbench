#!/bin/sh
set -eu
skill_name="diagram-workbench"
fixture=$(mktemp -d)
trap 'rm -rf "$fixture"' EXIT HUP INT TERM
sh scripts/install-skill.sh status "$fixture"
sh scripts/install-skill.sh install "$fixture"
sh scripts/install-skill.sh install "$fixture"
sh scripts/install-skill.sh status "$fixture"
[ -L "$fixture/$skill_name" ]
sh scripts/install-skill.sh uninstall "$fixture"
sh scripts/install-skill.sh uninstall "$fixture"
printf 'someone else\n' > "$fixture/$skill_name"
if sh scripts/install-skill.sh install "$fixture"; then
  printf 'Installer overwrote an existing file.\n' >&2
  exit 1
fi
[ -f "$fixture/$skill_name" ]
if sh scripts/install-skill.sh uninstall "$fixture"; then
  printf 'Uninstaller removed an unowned file.\n' >&2
  exit 1
fi
[ -f "$fixture/$skill_name" ]
printf 'Install lifecycle OK: %s\n' "$skill_name"
