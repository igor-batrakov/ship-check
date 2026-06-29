# ⚠️ Intentionally vulnerable app (fixture)

This is a **test fixture** for the `ship-check` plugin. It DELIBERATELY plants
vulnerabilities across all 5 audit domains. It is NOT a real app and NOT an example to follow.

All "secrets" here are obviously fake placeholders (`*FAKE*`), not real keys.

The expected findings are listed in `../EXPECTED.md`. Running the audit against this folder must
find every planted hole and mark 🟡 whatever it couldn't verify (not 🟢).
