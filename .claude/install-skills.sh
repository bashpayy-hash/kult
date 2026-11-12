#!/usr/bin/env bash
# SessionStart hook: cloud sessions start from a fresh container, so this
# reinstalls the design and development skills globally. It runs in the
# background (the session does not wait) and skips sources whose skills are
# already present. Log: /tmp/skills-install.log
set -u
log=/tmp/skills-install.log
(
  install() { # $1 = source, $2 = skill selector, $3 = a skill name that proves it is installed
    if [ -d "$HOME/.claude/skills/$3" ]; then echo "skip $1"; return; fi
    timeout 600 npx -y skills add "$1" -g -y -a claude-code -s "$2" || echo "failed $1"
  }
  install nutlope/hallmark '*' hallmark
  install dominikmartn/hue '*' hue
  install dammyjay93/interface-design '*' interface-design
  install zanwei/design-dna '*' design-dna
  install lottiefiles/motion-design-skill '*' motion-design
  install anthropics/skills frontend-design frontend-design
  install nateherkai/scroll-craft '*' scroll-craft
  install nextlevelbuilder/ui-ux-pro-max-skill '*' ui-ux-pro-max
  install addyosmani/agent-skills '*' spec-driven-development
  # Owner, 5 Nov («ещё используй эти плагины для дизайна»): Emil Kowalski's
  # animation and design-engineering skills (animate, review-animations,
  # improve-animations, choreograph, apple-design, mobile-native, break-ui…)
  # and the three.js r186 skills. lottiefiles/motion-design-skill is above.
  install emilkowalski/skills '*' animate
  install CloudAI-X/threejs-skills '*' threejs-fundamentals
  # Owner, 4 Nov: «добавь скил impeccable». Its own installer downloads a
  # bundle from impeccable.style, which the cloud proxy refuses, so the built
  # skill and its subagents are copied from the GitHub repository instead.
  if [ -d "$HOME/.claude/skills/impeccable" ]; then echo "skip impeccable"; else
    src=$(mktemp -d) && timeout 300 git clone -q --depth 1 https://github.com/pbakaus/impeccable "$src/impeccable" \
      && cp -R "$src/impeccable/plugin/skills/impeccable" "$HOME/.claude/skills/impeccable" \
      && mkdir -p "$HOME/.claude/agents" && cp "$src/impeccable/plugin/agents/"*.md "$HOME/.claude/agents/" \
      || echo "failed impeccable"
    rm -rf "$src"
  fi
  echo done
) > "$log" 2>&1 &
exit 0
