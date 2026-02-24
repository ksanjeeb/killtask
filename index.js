#!/usr/bin/env node

import { exec } from "child_process";
import os from "os";
import readline from "readline";

// ─── ANSI ─────────────────────────────────────────────────────────────────────
const c = {
  reset:    "\x1b[0m",
  bold:     "\x1b[1m",
  gray:     "\x1b[90m",
  red:      "\x1b[31m",
  green:    "\x1b[32m",
  yellow:   "\x1b[33m",
  cyan:     "\x1b[36m",
  white:    "\x1b[97m",
  magenta:  "\x1b[35m",
  bgRed:    "\x1b[41m",
};

const clr  = (code, str) => `${code}${str}${c.reset}`;
const gray    = s => clr(c.gray, s);
const red     = s => clr(c.red, s);
const green   = s => clr(c.green, s);
const yellow  = s => clr(c.yellow, s);
const cyan    = s => clr(c.cyan, s);
const white   = s => clr(c.white, s);
const magenta = s => clr(c.magenta, s);
const bold    = s => clr(c.bold, s);
const boldCyan    = s => `${c.bold}${c.cyan}${s}${c.reset}`;
const boldMagenta = s => `${c.bold}${c.magenta}${s}${c.reset}`;
const hitLabel    = s => `${c.bgRed}${c.bold} ${s} ${c.reset}`;

// ─── Args ─────────────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const FLAGS     = new Set(["--soft","--no-force","--all","--yes","-y","--verbose","-v","--help","-h"]);
const isForce   = !args.includes("--soft") && !args.includes("--no-force");
const isAll     = args.includes("--all");
const isYes     = args.includes("--yes") || args.includes("-y");
const isVerbose = args.includes("--verbose") || args.includes("-v");
const ports     = args.filter(a => !FLAGS.has(a) && !a.startsWith("-"));
const isWin     = os.platform() === "win32";

// ─── Helpers ──────────────────────────────────────────────────────────────────
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
  if (isVerbose) console.log(gray("    ·"), ...msg);
}

function confirm(q) {
  if (isYes) return Promise.resolve(true);
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(yellow(`  ⚠️  ${q} [y/N] `), a => { rl.close(); resolve(a.toLowerCase() === "y"); });
  });
}

function clearLine() {
  process.stdout.write("\r" + " ".repeat(72) + "\r");
}

// ─── Animation ────────────────────────────────────────────────────────────────
const TRACK = 24;
const MARIO = red("♜");
const ENEMY = `\x1b[32m♟${c.reset}`;

function drawBulletFrame(pos, enemyChar, label) {
  let track = "";
  for (let i = 0; i < TRACK; i++) {
    if (i === pos)       track += yellow("►");
    else if (i < pos)    track += gray("·");
    else                 track += gray("─");
  }
  process.stdout.write(`\r  ${MARIO} ${track} ${enemyChar}  ${label}`);
}

async function animateBullet() {
  for (let i = 0; i < 2; i++) {
    process.stdout.write(
      `\r  ${MARIO} ${gray("─".repeat(TRACK))} ${ENEMY}  ` +
      (i % 2 === 0 ? gray("aiming…") : yellow("🔫 FIRE!"))
    );
    await sleep(80);
  }
  for (let pos = 0; pos < TRACK; pos++) {
    drawBulletFrame(pos, ENEMY, white("pew pew…"));
    await sleep(18);
  }
}

async function animateExplosion() {
  const frames = [
    [yellow("✸"), hitLabel("HIT")         ],
    [red("✺"),    red("💥 BOOM!")          ],
    [yellow("✦"), red("☠  TERMINATED")    ],
    [" ",         green("✔  port killed") ],
  ];
  for (const [sym, label] of frames) {
    process.stdout.write(`\r  ${MARIO} ${gray("·".repeat(TRACK))} ${sym}  ${label}`);
    await sleep(60);
  }
  clearLine();
}

async function animateBounce() {
  for (let pos = TRACK - 1; pos >= 0; pos--) {
    let track = "";
    for (let i = 0; i < TRACK; i++) {
      if (i === pos)    track += red("◄");
      else if (i > pos) track += gray("·");
      else              track += gray("─");
    }
    process.stdout.write(`\r  ${MARIO} ${track} ${red("⛨")}  ${red("blocked!")}`);
    await sleep(12);
  }
  clearLine();
}

async function killWithAnimation(pid) {
  const killPromise = killPid(pid);
  await animateBullet();
  const ok = await killPromise;
  if (ok) await animateExplosion();
  else    await animateBounce();
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
    return gray("unknown");
  }
}

function buildLabel(name, cmdLine) {
  const tokens = (cmdLine || name).trim().split(/\s+/);
  const bin    = (name || tokens[0]?.split(/[/\\]/).pop() || "")
                   .replace(/\.exe$/i, "").toLowerCase();
  const entry  = tokens.slice(1).find(t => !t.startsWith("-")) ?? "";
  const short  = entry.split(/[/\\]/).pop();
  if (RUNTIMES.has(bin) && short)
    return `${white(bin)} ${gray("·")} ${cyan(short)}`;
  return white(bin || "unknown");
}

// ─── Process Discovery ────────────────────────────────────────────────────────
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
      log(red(e.message.split("\n").find(l => l.trim()) ?? e.message));
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
    console.log(red(`  ✗  Invalid port: ${port}`)); return;
  }

  const pids = await getPidsForPort(port);

  if (pids.size === 0) {
    console.log(`  ${gray("○")}  :${white(port)}  ${gray("— nothing listening")}`);
    nNotFound++; return;
  }

  for (const entry of pids.values()) {
    console.log(
      `\n  ${cyan("▸")}  :${boldCyan(port)}  ` +
      `${gray(`PID ${entry.pid}`)}  ${entry.appLabel}\n`
    );
    const ok = await killWithAnimation(entry.pid);
    if (ok) {
      console.log(`  ${red("☠")}  :${boldMagenta(port)} killed  ${gray("←")} ${entry.appLabel}`);
      nKilled++;
    } else {
      console.log(`  ${red("✗")}  :${bold(port)} could not be killed — try ${yellow("--soft")}`);
      nFailed++;
    }
    console.log();
  }
}

// ─── killAll ──────────────────────────────────────────────────────────────────
async function killAll() {
  const pids = await getAllListeningPids();
  if (pids.size === 0) {
    console.log(gray("  ○  No listening processes found.")); return;
  }

  console.log(cyan(`\n  ${pids.size} process(es) listening:\n`));
  for (const { pid, appLabel, port } of pids.values())
    console.log(`    ${gray(`:${String(port).padEnd(6)}`)} ${gray(`PID ${String(pid).padStart(6)}`)}  ${appLabel}`);
  console.log();

  const ok = await confirm(`Terminate ALL ${pids.size} processes?`);
  if (!ok) { console.log(gray("\n  Aborted.\n")); return; }

  for (const entry of pids.values()) {
    console.log(
      `\n  ${cyan("▸")}  :${boldCyan(entry.port)}  ` +
      `${gray(`PID ${entry.pid}`)}  ${entry.appLabel}\n`
    );
    const killed = await killWithAnimation(entry.pid);
    if (killed) {
      console.log(`  ${red("☠")}  :${boldMagenta(entry.port)} killed  ${gray("←")} ${entry.appLabel}`);
      nKilled++;
    } else {
      console.log(`  ${red("✗")}  :${bold(entry.port)} could not be killed`);
      nFailed++;
    }
    console.log();
  }
}

// ─── Help ─────────────────────────────────────────────────────────────────────
function showHelp() {
  console.log(`
  ${red("♜")} ${bold("killport")}

  ${cyan("Usage:")}
    killport <port> [port ...]
    killport --all

  ${cyan("Options:")}
    --soft, --no-force   Graceful SIGTERM before SIGKILL
    --all                Kill every listening process
    --yes, -y            Skip --all confirmation
    --verbose, -v        Show signal details
    --help, -h           This help

  ${cyan("Examples:")}
    killport 3000
    killport 3000 8080
    killport --all -y
`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (args.includes("--help") || args.includes("-h")) { showHelp(); process.exit(0); }

  if (!isAll && ports.length === 0) {
    console.error(red("\n  ❌  Provide at least one port, or use --all\n"));
    showHelp(); process.exit(1);
  }

  const target = isAll
    ? red("all processes")
    : ports.map(p => cyan(`:${p}`)).join(gray("  "));

  console.log(`\n  ${red("♜")} ${bold("killport")}  ${gray("·")}  ${target}\n`);

  try {
    if (isAll) {
      await killAll();
    } else {
      for (const port of ports) await killPort(port);
    }

    const parts = [];
    if (nKilled)   parts.push(green(`☠  ${nKilled} killed`));
    if (nFailed)   parts.push(red(`✗  ${nFailed} failed`));
    if (nNotFound) parts.push(gray(`○  ${nNotFound} not found`));
    if (parts.length) console.log("  " + parts.join(gray("   ·   ")));
    console.log();

  } catch (err) {
    clearLine();
    console.error(red("  ❌"), err.message);
    process.exit(1);
  }
}

main();