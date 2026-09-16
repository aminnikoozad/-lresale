import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const outputPath = resolve("lib/generated/admin-rate-limit-salt.ts");
await mkdir(dirname(outputPath), { recursive: true });

const salt = randomBytes(32).toString("hex");
const source = `// Auto-generated at build/dev time. Do not commit this file.\nexport const BUILD_ADMIN_RATE_LIMIT_SALT = ${JSON.stringify(salt)};\n`;

await writeFile(outputPath, source, { encoding: "utf8", mode: 0o600 });
