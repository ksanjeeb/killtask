#!/usr/bin/env node

import { exec } from "child_process";
import os from "os";
import readline from "readline";

const R="\x1b[0m",B="\x1b[1m",_g="\x1b[90m",_r="\x1b[31m",_G="\x1b[32m",_y="\x1b[33m",_c="\x1b[36m",_w="\x1b[97m",_m="\x1b[35m";
const cl=(a,s)=>`${a}${s}${R}`;
const g=s=>cl(_g,s),r=s=>cl(_r,s),G=s=>cl(_G,s),y=s=>cl(_y,s),c=s=>cl(_c,s),w=s=>cl(_w,s),bo=s=>cl(B,s);
const bc=s=>`${B}${_c}${s}${R}`,bm=s=>`${B}${_m}${s}${R}`;

const args=process.argv.slice(2);
const FL=new Set(["--soft","--no-force","--all","--yes","-y","--verbose","-v","--help","-h"]);
const isFo=!args.includes("--soft")&&!args.includes("--no-force");
const isAl=args.includes("--all"),isYe=args.includes("--yes")||args.includes("-y");
const isVe=args.includes("--verbose")||args.includes("-v");
const ports=args.filter(a=>!FL.has(a)&&!a.startsWith("-"));
const isWin=os.platform()==="win32";

const sl=ms=>new Promise(r=>setTimeout(r,ms));
const run=cmd=>new Promise((res,rej)=>exec(cmd,{timeout:8000},(e,o)=>e?rej(e):res(o.trim())));
const clrLine=()=>process.stdout.write("\r"+" ".repeat(72)+"\r");
const log=(...m)=>isVe&&console.log(g("    ·"),...m);

function confirm(q){
  if(isYe)return Promise.resolve(true);
  return new Promise(res=>{
    const rl=readline.createInterface({input:process.stdin,output:process.stdout});
    rl.question(y(`  ⚠️  ${q} [y/N] `),a=>{rl.close();res(a.toLowerCase()==="y");});
  });
}

const T=24,MA=r("♜"),EN=`${_G}♟${R}`;

function drawFrame(pos){
  let tr="";
  for(let i=0;i<T;i++) tr+=i===pos?y("►"):i<pos?g("·"):g("─");
  process.stdout.write(`\r  ${MA} ${tr} ${EN}  ${w("pew…")}`);
}

async function animateBullet(){
  process.stdout.write(`\r  ${MA} ${g("─".repeat(T))} ${EN}  ${y("🔫")}`);
  await sl(60);
  for(let p=0;p<T;p++){drawFrame(p);await sl(10);}
}

async function animateExplosion(){
  for(const[s,l]of[[y("✸"),r("💥 BOOM!")],[y("✦"),r("☠  TERMINATED")],[" ",G("✔  port killed")]]){
    process.stdout.write(`\r  ${MA} ${g("·".repeat(T))} ${s}  ${l}`);
    await sl(55);
  }
  clrLine();
}

async function animateBounce(){
  for(let p=T-1;p>=0;p--){
    let tr="";
    for(let i=0;i<T;i++) tr+=i===p?r("◄"):i>p?g("·"):g("─");
    process.stdout.write(`\r  ${MA} ${tr} ${r("⛨")}  ${r("blocked!")}`);
    await sl(8);
  }
  clrLine();
}

async function killWithAnimation(pid){
  const kp=killPid(pid);
  await animateBullet();
  const ok=await kp;
  await(ok?animateExplosion():animateBounce());
  return ok;
}

const RT=new Set(["node","python","python3","ruby","java","php","deno","bun"]);

async function getAppLabel(pid){
  try{
    let name="",cmd="";
    if(isWin){
      const tl=await run(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`).catch(()=>"");
      name=tl.split(",")[0]?.replace(/"/g,"").trim()??"";
      cmd=await run(`powershell -NoProfile -Command "(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).CommandLine"`).catch(()=>"");
    }else{
      [cmd,name]=await Promise.all([run(`ps -p ${pid} -o args=`).catch(()=>""),run(`ps -p ${pid} -o comm=`).catch(()=>"")]);
    }
    const tk=(cmd||name).trim().split(/\s+/);
    const bin=(name||tk[0]?.split(/[/\\]/).pop()||"").replace(/\.exe$/i,"").toLowerCase();
    const ent=tk.slice(1).find(t=>!t.startsWith("-"))??"";
    const sh=ent.split(/[/\\]/).pop();
    return RT.has(bin)&&sh?`${w(bin)} ${g("·")} ${c(sh)}`:w(bin||"unknown");
  }catch{return g("unknown");}
}

async function getPidsForPort(port){
  const pids=new Map();
  if(isWin){
    const out=await run(`netstat -ano -p TCP`).catch(()=>"");
    for(const line of out.split("\n")){
      if(!line.match(new RegExp(`:${port}[^\\d]`)))continue;
      const p=line.trim().split(/\s+/);
      if(p.length<5)continue;
      const[,,,state,pid]=p;
      if(!["LISTENING","ESTABLISHED"].includes(state)||!pid||pids.has(pid))continue;
      pids.set(pid,{pid,appLabel:await getAppLabel(pid),port});
    }
  }else{
    const out=await run(`lsof -nP -i TCP:${port}`).catch(()=>"");
    for(const line of out.split("\n").slice(1)){
      if(!line)continue;
      const pid=line.trim().split(/\s+/)[1];
      if(pid&&!pids.has(pid))pids.set(pid,{pid,appLabel:await getAppLabel(pid),port});
    }
  }
  return pids;
}

async function getAllListeningPids(){
  const pids=new Map();
  if(isWin){
    const out=await run(`netstat -ano -p TCP`).catch(()=>"");
    for(const line of out.split("\n")){
      if(!line.includes("LISTENING"))continue;
      const p=line.trim().split(/\s+/);
      if(p.length<5)continue;
      const pid=p[4],port=p[1]?.split(":").pop()??"?";
      if(pid&&pid!=="0"&&pid!=="4"&&!pids.has(pid))
        pids.set(pid,{pid,appLabel:await getAppLabel(pid),port});
    }
  }else{
    const out=await run(`lsof -nP -i TCP -s TCP:LISTEN`).catch(()=>"");
    for(const line of out.split("\n").slice(1)){
      if(!line)continue;
      const pid=line.trim().split(/\s+/)[1];
      const m=line.match(/:(\d+)\s+\(LISTEN\)/);
      const port=m?.[1]??"?";
      if(pid&&!pids.has(pid))pids.set(pid,{pid,appLabel:await getAppLabel(pid),port});
    }
  }
  return pids;
}

async function killPid(pid){
  if(isWin){
    try{await run(`taskkill ${isFo?"/F":""} /PID ${pid}`);log(`PID ${pid} terminated`);return true;}
    catch(e){log(r(e.message.split("\n").find(l=>l.trim())??e.message));return false;}
  }else{
    for(const sig of isFo?["-9"]:["-15","-9"]){
      try{
        await run(`kill ${sig} ${pid}`);
        await sl(200);
        const still=await run(`ps -p ${pid} -o pid=`).catch(()=>"");
        if(!still.trim()){log(`PID ${pid} gone (${sig})`);return true;}
      }catch{return true;}
    }
    return false;
  }
}

let nK=0,nF=0,nN=0;

async function killPort(port){
  if(!/^\d+$/.test(port)||+port<1||+port>65535){console.log(r(`  ✗  Invalid port: ${port}`));return;}
  const pids=await getPidsForPort(port);
  if(pids.size===0){console.log(`  ${g("○")}  :${w(port)}  ${g("— nothing listening")}`);nN++;return;}
  for(const e of pids.values()){
    console.log(`\n  ${c("▸")}  :${bc(port)}  ${g(`PID ${e.pid}`)}  ${e.appLabel}\n`);
    const ok=await killWithAnimation(e.pid);
    console.log(ok?`  ${r("☠")}  :${bm(port)} killed  ${g("←")} ${e.appLabel}`:`  ${r("✗")}  :${bo(port)} could not be killed — try ${y("--soft")}`);
    ok?nK++:nF++;
    console.log();
  }
}

async function killAll(){
  const pids=await getAllListeningPids();
  if(pids.size===0){console.log(g("  ○  No listening processes found."));return;}
  console.log(c(`\n  ${pids.size} process(es) listening:\n`));
  for(const{pid,appLabel,port}of pids.values())
    console.log(`    ${g(`:${String(port).padEnd(6)}`)} ${g(`PID ${String(pid).padStart(6)}`)}  ${appLabel}`);
  console.log();
  if(!await confirm(`Terminate ALL ${pids.size} processes?`)){console.log(g("\n  Aborted.\n"));return;}
  for(const e of pids.values()){
    console.log(`\n  ${c("▸")}  :${bc(e.port)}  ${g(`PID ${e.pid}`)}  ${e.appLabel}\n`);
    const ok=await killWithAnimation(e.pid);
    console.log(ok?`  ${r("☠")}  :${bm(e.port)} killed  ${g("←")} ${e.appLabel}`:`  ${r("✗")}  :${bo(e.port)} could not be killed`);
    ok?nK++:nF++;
    console.log();
  }
}

function showHelp(){
  console.log(`
  ${r("♜")} ${bo("killtask")}

  ${c("Usage:")}
    killtask <port> [port ...]
    killtask --all

  ${c("Options:")}
    --soft, --no-force   Graceful SIGTERM before SIGKILL
    --all                Kill every listening process
    --yes, -y            Skip --all confirmation
    --verbose, -v        Show signal details
    --help, -h           This help

  ${c("Examples:")}
    killtask 3000
    killtask 3000 8080
    killtask --all -y
`);
}

async function main(){
  if(args.includes("--help")||args.includes("-h")){showHelp();process.exit(0);}
  if(!isAl&&ports.length===0){console.error(r("\n  ❌  Provide at least one port, or use --all\n"));showHelp();process.exit(1);}
  const target=isAl?r("all processes"):ports.map(p=>c(`:${p}`)).join(g("  "));
  console.log(`\n  ${r("♜")} ${bo("killtask")}  ${g("·")}  ${target}\n`);
  try{
    if(isAl)await killAll();
    else for(const port of ports)await killPort(port);
    const parts=[];
    if(nK)parts.push(G(`☠  ${nK} killed`));
    if(nF)parts.push(r(`✗  ${nF} failed`));
    if(nN)parts.push(g(`○  ${nN} not found`));
    if(parts.length)console.log("  "+parts.join(g("   ·   ")));
    console.log();
  }catch(e){clrLine();console.error(r("  ❌"),e.message);process.exit(1);}
}

main();