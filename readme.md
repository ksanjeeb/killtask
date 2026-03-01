<img width="2080" height="732" alt="image" src="https://github.com/user-attachments/assets/388505f7-ef1b-4567-bb18-98d6f9154df2" />

# killtask

CLI to kill processes running on specific ports.

## Installation

```bash
npm install -g killtask
```

Or use without installing:

```bash
npx killtask <port>
```

## Usage

Kill a single port:

```bash
npx killtask 8080
```

Kill multiple ports:

```bash
npx killtask 8080 3000
```

Kill all listening ports:

```bash
npx killtask --all
```

## Confirmation Prompt

By default, killtask will **ask for confirmation** before killing each port.

```
  ⚠️  Kill :3000 (PID 12345)? [press Enter to confirm, any other key to cancel]
```

- Press **Enter** → proceeds with the kill
- Press **any other key** + Enter → cancels and skips the process

To skip the confirmation entirely, use `--force` or `-f`:

```bash
npx killtask 3000 --force
npx killtask 3000 -f
```

## Options

| Flag | Alias | Description |
|------|-------|-------------|
| `--force` | `-f` | Skip confirmation and kill immediately |
| `--yes` | `-y` | Skip all confirmation prompts |
| `--all` | | Kill every listening process |
| `--soft` | `--no-force` | Graceful SIGTERM before SIGKILL |
| `--verbose` | `-v` | Show signal details |
| `--help` | `-h` | Show help |

## Examples

```bash
# Kill port 3000 (with confirmation prompt)
npx killtask 3000

# Kill port 3000 immediately, no prompt
npx killtask 3000 --force

# Kill multiple ports with no prompt
npx killtask 3000 8080 -f

# Kill all listening processes (asks confirmation before all)
npx killtask --all

# Kill all listening processes immediately, no prompt
npx killtask --all --force

# Graceful kill (SIGTERM first, then SIGKILL)
npx killtask 3000 --soft
```
