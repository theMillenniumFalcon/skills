#!/bin/bash

# Core shadcn components installed on every project.
# Add or remove components from this list as needed.
components=(
    "button"
    "badge"
    "card"
    "input"
    "dialog"
    "dropdown-menu"
)

echo "Installing shadcn components..."

for component in "${components[@]}"; do
    echo "→ Adding $component"
    bunx shadcn@latest add "$component" --overwrite
done

echo "✓ Done"