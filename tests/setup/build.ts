import { execFileSync } from "node:child_process";

export default function (): void {
  execFileSync("npm", ["run", "build"], { cwd: process.cwd(), stdio: "ignore" });
}
