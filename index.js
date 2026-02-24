#!/usr/bin/env node

import { exec } from "child_process";
import os from "os";
import chalk from "chalk";
import readline from "readline";

// ─── Args ────────────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const FLAGS     = new Set(["--soft","--no-force","--all","--yes","-y","--verbose","-v","--help","-h"]);
const isForce   = !args.includes("--soft") && !args.includes("--no-force");
const isAll     = args.includes("--all");
const isYes     = args.includes("--yes") || args.includes("-y");
const isVerbose = args.includes("--verbose") || args.includes("-v");
const ports     = args.filter(a => !FLAGS.has(a) && !a.startsWith("-"));
const isWin     = os.platform() === "win32";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

function run(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 8_000 }, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout.trim());
    });
  });
}

function log(...msg) {
  if (isVerbose) console.log(chalk.gray("    ·"), ...msg);
}

function confirm(q) {
  if (isYes) return Promise.resolve(true);
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(chalk.yellow(`  ⚠️  ${q} [y/N] `), a => { rl.close(); resolve(a.toLowerCase() === "y"); });
  });
}

function clearLine() {
  process.stdout.write("\r" + " ".repeat(72) + "\r");
}

// ─── Animation ───────────────────────────────────────────────────────────────
// Runs CONCURRENTLY with the kill — bullet travels while kill executes,
// explosion plays after kill resolves.

const TRACK = 24;
const MARIO = chalk.red("♜");
const ENEMY = chalk.green("♟");

function drawFrame(bulletPos, enemyChar, label) {
  let track = "";
  for (let i = 0; i < TRACK; i++) {
    if (i === bulletPos)        track += chalk.yellowBright("►");
    else if (i < bulletPos)     track += chalk.gray("·");
    else                        track += chalk.gray("─");
  }
  process.stdout.write(`\r  ${MARIO} ${track} ${enemyChar}  ${label}`);
}

// Animate bullet travelling — returns a promise that resolves when bullet reaches end
async function animateBullet() {
  // Aim flash
  for (let i = 0; i < 3; i++) {
    process.stdout.write(
      `\r  ${MARIO} ${chalk.gray("─".repeat(TRACK))} ${ENEMY}  ` +
      (i % 2 === 0 ? chalk.gray("aiming…") : chalk.yellowBright("🔫 FIRE!"))
    );
    await sleep(180);
  }
  // Bullet travels
  for (let pos = 0; pos < TRACK; pos++) {
    drawFrame(pos, ENEMY, chalk.white("pew pew…"));
    await sleep(36);
  }
}

async function animateExplosion() {
  const frames = [
    [chalk.yellowBright("✸"), chalk.bgRed.bold(" HIT ")     ],
    [chalk.red("✺"),           chalk.red("💥 BOOM!")        ],
    [chalk.yellowBright("✦"), chalk.red("☠  TERMINATED")   ],
    [chalk.white("·"),         chalk.green("✔  port killed") ],
    [" ",                      chalk.green("✔  port killed") ],
  ];
  for (const [sym, label] of frames) {
    process.stdout.write(
      `\r  ${MARIO} ${chalk.gray("·".repeat(TRACK))} ${sym}  ${label}`
    );
    await sleep(85);
  }
  clearLine();
}

async function animateBounce() {
  for (let pos = TRACK - 1; pos >= 0; pos--) {
    let track = "";
    for (let i = 0; i < TRACK; i++) {
      if (i === pos)      track += chalk.red("◄");
      else if (i > pos)   track += chalk.gray("·");
      else                track += chalk.gray("─");
    }
    process.stdout.write(
      `\r  ${MARIO} ${track} ${chalk.red("⛨")}  ${chalk.red("blocked!")}`
    );
    await sleep(22);
  }
  clearLine();
}

// ─── Kill + animate concurrently ─────────────────────────────────────────────
async function killWithAnimation(pid) {
  // Start bullet animation and kill in parallel
  const killPromise = killPid(pid);
  await animateBullet();

  // Wait for kill to finish (it's usually done by now)
  const ok = await killPromise;

  if (ok) {
    await animateExplosion();
  } else {
    await animateBounce();
  }

  return ok;
}

// ─── App Name ─────────────────────────────────────────────────────────────────
const RUNTIMES = new Set(["node","python","python3","ruby","java","php","deno","bun"]);

async function getAppLabel(pid) {
  try {
    let name = "", cmdLine = "";
    if (isWin) {
      const tl = await run(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`).catch(() => "");
      name = tl.split(",")[0]?.replace(/"/g, "").trim() ?? "";
      const ps = await run(
        `powershell -NoProfile -Command "(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).CommandLine"`
      ).catch(() => "");
      cmdLine = ps.trim();
    } else {
      [cmdLine, name] = await Promise.all([
        run(`ps -p ${pid} -o args=`).catch(() => ""),
        run(`ps -p ${pid} -o comm=`).catch(() => ""),
      ]);
    }
    return buildLabel(name, cmdLine);
  } catch {
    return chalk.gray("unknown");
  }
}

function buildLabel(name, cmdLine) {
  const tokens = (cmdLine || name).trim().split(/\s+/);
  const bin    = (name || tokens[0]?.split(/[/\\]/).pop() || "")
                   .replace(/\.exe$/i, "").toLowerCase();
  const entry  = tokens.slice(1).find(t => !t.startsWith("-")) ?? "";
  const short  = entry.split(/[/\\]/).pop();
  if (RUNTIMES.has(bin) && short)
    return `${chalk.white(bin)} ${chalk.gray("·")} ${chalk.cyan(short)}`;
  return chalk.white(bin || "unknown");
}

// ─── Process Discovery ───────────────────────────────────────────────────────
async function getPidsForPort(port) {
  const pids = new Map();
  if (isWin) {
    const out = await run(`netstat -ano -p TCP`).catch(() => "");
    for (const line of out.split("\n")) {
      if (!line.match(new RegExp(`:${port}[^\\d]`))) continue;
      const p = line.trim().split(/\s+/);
      if (p.length < 5) continue;
      const [,,, state, pid] = p;
      if (!["LISTENING","ESTABLISHED"].includes(state)) continue;
      if (pid && !pids.has(pid))
        pids.set(pid, { pid, appLabel: await getAppLabel(pid), port });
    }
  } else {
    const out = await run(`lsof -nP -i TCP:${port}`).catch(() => "");
    for (const line of out.split("\n").slice(1)) {
      if (!line) continue;
      const pid = line.trim().split(/\s+/)[1];
      if (pid && !pids.has(pid))
        pids.set(pid, { pid, appLabel: await getAppLabel(pid), port });
    }
  }
  return pids;
}

async function getAllListeningPids() {
  const pids = new Map();
  if (isWin) {
    const out = await run(`netstat -ano -p TCP`).catch(() => "");
    for (const line of out.split("\n")) {
      if (!line.includes("LISTENING")) continue;
      const p = line.trim().split(/\s+/);
      if (p.length < 5) continue;
      const pid  = p[4];
      const port = p[1]?.split(":").pop() ?? "?";
      if (pid && pid !== "0" && pid !== "4" && !pids.has(pid))
        pids.set(pid, { pid, appLabel: await getAppLabel(pid), port });
    }
  } else {
    const out = await run(`lsof -nP -i TCP -s TCP:LISTEN`).catch(() => "");
    for (const line of out.split("\n").slice(1)) {
      if (!line) continue;
      const parts = line.trim().split(/\s+/);
      const pid   = parts[1];
      const m     = line.match(/:(\d+)\s+\(LISTEN\)/);
      const port  = m?.[1] ?? "?";
      if (pid && !pids.has(pid))
        pids.set(pid, { pid, appLabel: await getAppLabel(pid), port });
    }
  }
  return pids;
}

// ─── Kill ─────────────────────────────────────────────────────────────────────
async function killPid(pid) {
  if (isWin) {
    try {
      await run(`taskkill ${isForce ? "/F" : ""} /PID ${pid}`);
      log(`PID ${pid} terminated`);
      return true;
    } catch (e) {
      log(chalk.red(e.message.split("\n").find(l => l.trim()) ?? e.message));
      return false;
    }
  } else {
    const sigs = isForce ? ["-9"] : ["-15", "-9"];
    for (const sig of sigs) {
      try {
        await run(`kill ${sig} ${pid}`);
        await sleep(200);
        const still = await run(`ps -p ${pid} -o pid=`).catch(() => "");
        if (!still.trim()) { log(`PID ${pid} gone (${sig})`); return true; }
      } catch { return true; }
    }
    return false;
  }
}

// ─── Counters ─────────────────────────────────────────────────────────────────
let nKilled = 0, nFailed = 0, nNotFound = 0;

// ─── killPort ─────────────────────────────────────────────────────────────────
async function killPort(port) {
  if (!/^\d+$/.test(port) || +port < 1 || +port > 65535) {
    console.log(chalk.red(`  ✗  Invalid port: ${port}`)); return;
  }

  const pids = await getPidsForPort(port);

  if (pids.size === 0) {
    console.log(`  ${chalk.gray("○")}  :${chalk.white(port)}  ${chalk.gray("— nothing listening")}`);
    nNotFound++; return;
  }

  for (const entry of pids.values()) {
    // Single info line
    console.log(
      `\n  ${chalk.cyan("▸")}  :${chalk.bold.cyan(port)}  ` +
      `${chalk.gray(`PID ${entry.pid}`)}  ${entry.appLabel}\n`
    );

    const ok = await killWithAnimation(entry.pid);

    if (ok) {
      console.log(`  ${chalk.red("☠")}  :${chalk.bold.magenta(port)} killed  ${chalk.gray("←")} ${entry.appLabel}`);
      nKilled++;
    } else {
      console.log(`  ${chalk.red("✗")}  :${chalk.bold(port)} could not be killed — try ${chalk.yellow("--soft")}`);
      nFailed++;
    }
    console.log();
  }
}

// ─── killAll ──────────────────────────────────────────────────────────────────
async function killAll() {
  const pids = await getAllListeningPids();
  if (pids.size === 0) {
    console.log(chalk.gray("  ○  No listening processes found.")); return;
  }

  console.log(chalk.cyan(`\n  ${pids.size} process(es) listening:\n`));
  for (const { pid, appLabel, port } of pids.values())
    console.log(`    ${chalk.gray(`:${String(port).padEnd(6)}`)} ${chalk.gray(`PID ${String(pid).padStart(6)}`)}  ${appLabel}`);
  console.log();

  const ok = await confirm(`Terminate ALL ${pids.size} processes?`);
  if (!ok) { console.log(chalk.gray("\n  Aborted.\n")); return; }

  for (const entry of pids.values()) {
    console.log(
      `\n  ${chalk.cyan("▸")}  :${chalk.bold.cyan(entry.port)}  ` +
      `${chalk.gray(`PID ${entry.pid}`)}  ${entry.appLabel}\n`
    );
    const killed = await killWithAnimation(entry.pid);
    if (killed) {
      console.log(`  ${chalk.red("☠")}  :${chalk.bold.magenta(entry.port)} killed  ${chalk.gray("←")} ${entry.appLabel}`);
      nKilled++;
    } else {
      console.log(`  ${chalk.red("✗")}  :${chalk.bold(entry.port)} could not be killed`);
      nFailed++;
    }
    console.log();
  }
}

// ─── Help ─────────────────────────────────────────────────────────────────────
function showHelp() {
  console.log(`
  ${chalk.red("♜")} ${chalk.bold("killport")}

  ${chalk.cyan("Usage:")}
    killport <port> [port ...]
    killport --all

  ${chalk.cyan("Options:")}
    --soft, --no-force   Graceful SIGTERM before SIGKILL
    --all                Kill every listening process
    --yes, -y            Skip --all confirmation
    --verbose, -v        Show signal details
    --help, -h           This help

  ${chalk.cyan("Examples:")}
    killport 3000
    killport 3000 8080
    killport --all -y
`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (args.includes("--help") || args.includes("-h")) { showHelp(); process.exit(0); }

  if (!isAll && ports.length === 0) {
    console.error(chalk.red("\n  ❌  Provide at least one port, or use --all\n"));
    showHelp(); process.exit(1);
  }

  const target = isAll
    ? chalk.red("all processes")
    : ports.map(p => chalk.cyan(`:${p}`)).join(chalk.gray("  "));

  console.log(`\n  ${chalk.red("♜")} ${chalk.bold("killport")}  ${chalk.gray("·")}  ${target}\n`);

  try {
    if (isAll) {
      await killAll();
    } else {
      for (const port of ports) await killPort(port);
    }

    const parts = [];
    if (nKilled)   parts.push(chalk.green(`☠  ${nKilled} killed`));
    if (nFailed)   parts.push(chalk.red(`✗  ${nFailed} failed`));
    if (nNotFound) parts.push(chalk.gray(`○  ${nNotFound} not found`));
    if (parts.length) console.log("  " + parts.join(chalk.gray("   ·   ")));
    console.log();

  } catch (err) {
    clearLine();
    console.error(chalk.red("  ❌"), err.message);
    process.exit(1);
  }
}

main();