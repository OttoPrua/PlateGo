import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

const child = spawn("npm", ["run", "dev:web"], {
  cwd: process.cwd(),
  stdio: ["inherit", "pipe", "pipe"]
});

const forward = (stream, target) => stream.on("data", (chunk) => {
  const lines = chunk.toString().split("\n").filter(Boolean);
  for (const line of lines) target.write(`[WEB] ${line}\n`);
});
forward(child.stdout, process.stdout);
forward(child.stderr, process.stderr);
child.on("exit", (code) => {
  if (code && code !== 0) console.error(`[WEB] 已退出，状态码 ${code}`);
});

console.log("PlateGo 公开工作区正在启动：");
console.log("  网页与官方页样机  http://127.0.0.1:4173");
console.log("按 Ctrl+C 停止。插件请先运行 npm run build:extension，再加载 apps/extension/dist。");
if (existsSync("services/pool-api/package.json") || existsSync("private")) {
  console.log("本机还存在未纳入公开工作区的私有目录；公开脚本不会读取或启动它们。\n");
} else {
  console.log("");
}

function stop(signal) {
  if (!child.killed) child.kill(signal);
}

process.on("SIGINT", () => { stop("SIGINT"); process.exit(0); });
process.on("SIGTERM", () => { stop("SIGTERM"); process.exit(0); });

await new Promise((resolve) => child.on("exit", resolve));
