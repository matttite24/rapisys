// Envoltorio de `shadcn add`: no sobrescribe componentes existentes y corrige
// el import de `cn` (el registro lo reescribe a un paquete npm ajeno).
// Uso: npm run ui:add -- dialog table
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const components = process.argv.slice(2);
if (components.length === 0) {
  console.error("Uso: npm run ui:add -- <componente> [...]");
  process.exit(1);
}

// Responde "no" a cualquier pregunta de sobrescritura.
spawnSync("npx", ["--yes", "shadcn@latest", "add", ...components], {
  input: "n\n".repeat(30),
  stdio: ["pipe", "inherit", "inherit"],
});

const dir = "src/components/ui";
let fixed = 0;
for (const file of readdirSync(dir)) {
  const path = join(dir, file);
  const src = readFileSync(path, "utf8");
  if (src.includes('from "cn"')) {
    writeFileSync(path, src.replaceAll('from "cn"', 'from "@/lib/utils"'));
    fixed++;
  }
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
if (pkg.dependencies?.cn) spawnSync("npm", ["rm", "cn"], { stdio: "inherit" });

console.log(`\nui:add listo. Imports de cn corregidos en ${fixed} archivo(s).`);
