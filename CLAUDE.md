# Easelect Development Guide

## Build & Run Commands
- Build and run: `./build_and_run.sh` or `go build && ./easelect` 
- Lint JS: `npx eslint . --fix`
- Lint CSS: `npm run lint:css`
- Check JS imports: `node ./frontend/check_js_imports2.js ./frontend/main.js --exclude=others/**,frontend/styles/**,node_modules/**,frontend/check_js_imports*.js --fix-imports`
- Fix GO imports: `node fix_go_imports.js --file=<filename> --fix-imports`

## Code Style Guidelines
- **Go**: Go 1.23+ with properly structured packages, use camelCase for variable/function names
- **JS**: ECMAScript latest, module imports, follow ESLint rules (import/named, import/export)
- **Error Handling**: In Go, return errors explicitly `return "", fmt.Errorf("virheellinen tunniste: %s", identifier)`
- **Formatting**: Use automatic formatters (gofmt for Go, ESLint for JS)
- **Security**: All identifiers must be sanitized before use in database operations
- **Imports**: Group standard lib imports first, followed by third-party packages
- **CSS**: Follow stylelint-config-standard rules
- **Documentation**: Add descriptive comments for functions (especially in public APIs)
- **Naming**: Consistent casing (camelCase for JS/Go variables, PascalCase for Go exports)