# Husky Git Hooks Configuration

This project uses Husky to enforce code quality and maintain a healthy codebase through automated git hooks.

## 🪝 Available Hooks

### Pre-Commit Hook (`.husky/pre-commit`)
**Runs on every commit**

- **Lint-staged**: Automatically fixes and formats staged files
- **ESLint**: Fixes linting issues in TypeScript files
- **Prettier**: Formats code according to project standards
- **File Types**: `.ts` files in `src/` and `dev/` directories

### Pre-Push Hook (`.husky/pre-push`)
**Runs before pushing to remote**

- **TypeScript Compilation**: Ensures no TypeScript errors
- **ESLint**: Runs full linting on all files
- **Outdated Dependencies**: Checks for outdated packages
- **Security Audit**: Scans for security vulnerabilities
- **Production Build**: Ensures the app builds successfully
- **Large Files**: Warns about files > 1MB

### Commit Message Hook (`.husky/commit-msg`)
**Validates commit messages**

- **Conventional Commits**: Enforces conventional commit format
- **Message Length**: Keeps messages under 100 characters
- **Content Validation**: Prevents WIP/TODO commits

## 🚀 Usage

### Normal Workflow
```bash
# Make changes to your code
git add .
git commit -m "feat: add new feature"  # Pre-commit runs automatically
git push origin feature-branch         # Pre-push runs automatically
```

### Bypassing Hooks (Use with caution!)
```bash
# Skip pre-commit hook
git commit -m "feat: add feature" --no-verify

# Skip pre-push hook
git push origin branch --no-verify
```

## 📋 Commit Message Format

Follow the conventional commits specification:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Valid Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `build`: Build system changes
- `ci`: CI/CD changes
- `chore`: Maintenance tasks
- `revert`: Revert previous commit

### Examples:
```bash
feat(auth): add login functionality
fix(api): resolve database connection issue
docs: update README with setup instructions
refactor(service): simplify user service
perf: optimize database queries
test: add unit tests for utils
```

## 🛠️ Manual Commands

You can run the same checks manually:

```bash
# Run all quality checks
npm run check-all

# Individual checks
npm run lint              # ESLint
npm run lint:check       # ESLint (check only)
npm run lint:fix         # ESLint (auto-fix)
npm run pretty:check     # Prettier (check only)
npm run pretty           # Prettier (format)
npm run build            # Production build
npm run check-deps       # Outdated dependencies
npm run check-security   # Security audit
```

## ⚙️ Configuration Files

- **lint-staged**: `package.json` → `lint-staged` section
- **ESLint**: `eslint.config.mjs`
- **Prettier**: `.prettierrc`
- **TypeScript**: `tsconfig.json`

## 🔧 Troubleshooting

### Common Issues:

1. **Pre-commit fails with linting errors**
   ```bash
   npm run lint:fix  # Fix automatically
   git add .
   git commit -m "fix: resolve linting issues"
   ```

2. **Pre-push fails with build errors**
   ```bash
   npm run build     # Check build locally
   # Fix build issues, then commit and push
   ```

3. **Outdated dependencies warning**
   ```bash
   npm update        # Update dependencies
   npm audit fix     # Fix security issues
   ```

4. **Commit message rejected**
   - Use conventional commit format
   - Keep message under 100 characters
   - Avoid WIP/TODO in commit messages

### Disabling Hooks Temporarily:
```bash
# For emergency fixes only
git commit -m "hotfix: critical issue" --no-verify
git push origin main --no-verify
```

## 📊 Benefits

- **Code Quality**: Consistent formatting and linting
- **Security**: Automatic vulnerability scanning
- **Type Safety**: TypeScript compilation checks
- **Documentation**: Enforced commit message standards
- **Team Collaboration**: Consistent codebase standards
- **CI/CD Ready**: Pre-validated code for deployment

## 🎯 Best Practices

1. **Always run checks locally** before pushing
2. **Fix issues immediately** rather than bypassing hooks
3. **Use meaningful commit messages** following conventional format
4. **Keep dependencies updated** regularly
5. **Address security vulnerabilities** promptly
6. **Review large files** before committing
7. **Complete TODO items** before committing

## 🔄 Updating Hooks

To modify hooks, edit the files in `.husky/` directory:

```bash
# Edit pre-commit hook
code .husky/pre-commit

# Edit pre-push hook (Bash)
code .husky/pre-push

# Edit pre-push hook (PowerShell for Windows)
code .husky/pre-push.ps1

# Edit commit message hook
code .husky/commit-msg
```

After making changes, test them:
```bash
# Test pre-commit
git add .
git commit -m "test: verify hooks"

# Test pre-push
git push origin test-branch
```

## 🪟 Windows Support

For Windows users, there's a PowerShell version of the pre-push hook (`.husky/pre-push.ps1`) that provides the same functionality with Windows-compatible commands.

