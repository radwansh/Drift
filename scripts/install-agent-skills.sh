#!/usr/bin/env bash
# Installs the agent skills used by Clarivo's code-reviewer, test-engineer,
# marketing-lead and payroll-manager subagents (.claude/agents/) into
# .claude/skills/ for Claude Code.
#
# Run from anywhere inside the repo, then commit .claude/skills/ and skills-lock.json.
# Committed skills load in the terminal, the desktop app, VS Code, cloud sessions
# and GitHub Actions alike, because they are part of the repository.
#
# Keep them current, the same way you would dependencies:
#   npx -y skills@1.7.4 check        # what changed upstream
#   npx -y skills@1.7.4 update -p    # pull project skills again
#   git diff .claude/skills          # read the change before committing it
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

export DISABLE_TELEMETRY=1 # optional: no anonymous usage data or audit calls to skills.sh

add() { npx -y skills@1.7.4 add "$@" --agent claude-code --yes; }

# --- code-reviewer --------------------------------------------------------------
add getsentry/skills --skill find-bugs
add trailofbits/skills --skill differential-review
add semgrep/skills --skill llm-security
add vercel-labs/agent-skills --skill vercel-react-best-practices

# --- test-engineer --------------------------------------------------------------
add antfu/skills --skill vitest
add trailofbits/skills --skill property-based-testing
add currents-dev/playwright-best-practices-skill --skill playwright-best-practices
add clerk/skills --skill clerk-testing
add obra/superpowers --skill test-driven-development --skill verification-before-completion
add addyosmani/web-quality-skills --skill accessibility --skill web-quality-audit

# --- marketing-lead -------------------------------------------------------------
add coreyhaines31/marketingskills \
  --skill product-marketing --skill copywriting --skill copy-editing \
  --skill seo-audit --skill ai-seo --skill schema --skill content-strategy \
  --skill cro --skill signup --skill pricing --skill launch --skill emails \
  --skill competitors --skill directory-submissions --skill analytics \
  --skill customer-research
add addyosmani/web-quality-skills --skill seo
add resend/resend-skills --skill email-best-practices

# --- payroll-manager ------------------------------------------------------------
# Anthropic's finance, data and HR skills. Excel work uses the xlsx skill from
# your claude.ai account, which isn't redistributable, so it isn't vendored here.
add anthropics/knowledge-work-plugins \
  --skill variance-analysis --skill reconciliation \
  --skill explore-data --skill statistical-analysis --skill people-report

# --- shared stack knowledge (your own sessions; agents load these on demand) ----
add vercel/turborepo --skill turborepo
add neondatabase/agent-skills --skill neon-postgres
add clerk/skills --skill clerk-nextjs-patterns

# --- vetting skills before you add more ----------------------------------------
add getsentry/skills --skill skill-scanner

# --- optional: read the note first ---------------------------------------------
# Lets an agent drive a real browser for exploratory checks. Needs the CLI:
#   npm install -g @playwright/cli
# add microsoft/playwright-cli --skill playwright-cli
#
# Runs `npx shadcn@latest info --json` every time the skill loads.
# add shadcn/ui --skill shadcn

echo
echo "Done. Review, then commit:  git add .claude/skills skills-lock.json"
