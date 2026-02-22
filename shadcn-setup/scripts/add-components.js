import { execSync } from "child_process";

// Core shadcn components installed on every project.
// Add or remove components from this list as needed.
const components = [
    "button",
    "badge",
    "card",
    "input",
    "dialog",
    "dropdown-menu",
];

console.log("Installing shadcn components...");

for (const component of components) {
    console.log(`→ Adding ${component}`);
    execSync(`bunx shadcn@latest add ${component} --overwrite`, {
        stdio: "inherit",
    });
}

console.log("✓ Done");