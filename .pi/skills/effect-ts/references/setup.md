# Effect Source Setup

This setup task is required when `./.agent_sources/effect` is missing from the root of the repository where this skill is used.

## Prompt

The local Effect source checkout was not found at `./.agent_sources/effect`.

Choose one of these setup options before continuing:

1. Add `https://github.com/Effect-TS/effect-smol` as a git subtree with squashed history at `./.agent_sources/effect`
2. Add `https://github.com/Effect-TS/effect-smol` as a git submodule at `./.agent_sources/effect`
3. Use `git clone` into `./.agent_sources/effect`, ignore it via `.gitignore`, and add a prepare script that bootstraps it when missing

## Supported Options

### 1. Git Subtree

Use this when the repository should vendor the Effect source directly while keeping history compact.

- Repo path: `./.agent_sources/effect`
- Source: `https://github.com/Effect-TS/effect-smol`
- Preferred shape: subtree with squashed history

### 2. Git Submodule

Use this when the repository should track the Effect source explicitly as a separate Git dependency.

- Repo path: `./.agent_sources/effect`
- Source: `https://github.com/Effect-TS/effect-smol`
- Preferred shape: standard Git submodule

### 3. Local Clone + Gitignore + Prepare Task

Use this when the repository should avoid vendoring or submodule management, but still provide a reproducible local setup.

- Repo path: `./.agent_sources/effect`
- Source: `https://github.com/Effect-TS/effect-smol`
- Add `.agent_sources/effect` to the repository `.gitignore`
- Add a `prepare` task that clones the repo automatically when the directory is missing

#### Concrete Shape

Use this exact shape for the setup. Do not invent a different script.

`package.json`:

```json
{
  "scripts": {
    "prepare": "./scripts/prepare-effect.sh"
  }
}
```

`.gitignore`:

```gitignore
.agent_sources/effect
```

`scripts/prepare-effect.sh`:

```sh
#!/usr/bin/env sh

set -eu

repo_dir=".agent_sources/effect"
repo_url="https://github.com/Effect-TS/effect-smol"

if [ -d "$repo_dir/.git" ]; then
  exit 0
fi

mkdir -p ".agent_sources"
git clone "$repo_url" "$repo_dir"
```

#### Notes

- This keeps `./.agent_sources/effect` available for local research without forcing it into version control
- The script is only responsible for ensuring the checkout exists; it does not update or reset an existing clone
- If you choose this option, the setup task should add this exact script, wire it via `prepare`, and add `.agent_sources/effect` to `.gitignore`

## Guidance

- Do not continue with Effect-specific work until one of the setup options is chosen.
- Prefer the option that matches the host repository's dependency management style.

## Repository decision (agentic-loop)

This repository vendors Effect at `./.agent_sources/effect` (effect-smol tree, no nested `.git`).
Agents should treat that path as the research source. Do not re-clone unless the directory is missing.

