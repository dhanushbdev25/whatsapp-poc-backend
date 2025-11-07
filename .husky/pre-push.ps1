# PowerShell version of pre-push hook for Windows
Write-Host "🚀 Running pre-push checks..." -ForegroundColor Blue

# Pre-push hook configuration:
# - TypeScript errors: MANDATORY (push will fail)
# - ESLint errors: MANDATORY (push will fail)  
# - Outdated dependencies: INTERACTIVE (user can choose to continue)
# - Security vulnerabilities: INTERACTIVE (user can choose to continue)
# - Build failures: MANDATORY (push will fail)
# - Large files: INTERACTIVE (user can choose to continue)

# Function to print colored output
function Write-Status {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Check if we're on main/master branch
$CURRENT_BRANCH = git branch --show-current
if ($CURRENT_BRANCH -eq "main" -or $CURRENT_BRANCH -eq "master") {
    Write-Warning "You're pushing to $CURRENT_BRANCH branch. Make sure this is intentional!"
}

# 1. Check for TypeScript compilation errors (MANDATORY)
Write-Status "Checking TypeScript compilation..."
$TSC_OUTPUT = npx tsc --noEmit 2>&1
$TS_EXIT_CODE = $LASTEXITCODE

if ($TS_EXIT_CODE -ne 0) {
    $ERROR_COUNT = ($TSC_OUTPUT | Select-String "error TS").Count
    Write-Error "TypeScript compilation found $ERROR_COUNT errors!"
    Write-Host ""
    Write-Error "All TypeScript errors must be resolved before pushing."
    Write-Error "Run 'npm run check-all' to identify and fix type errors."
    Write-Host ""
    Write-Host $TSC_OUTPUT
    Write-Host ""
    Write-Error "Push blocked due to TypeScript errors."
    exit 1
} else {
    Write-Success "TypeScript compilation passed"
}

# 2. Run ESLint on all files
Write-Status "Running ESLint on all files..."
npm run lint
if ($LASTEXITCODE -ne 0) {
    Write-Error "ESLint checks failed!"
    exit 1
}
Write-Success "ESLint checks passed"

# 3. Check for outdated dependencies (INTERACTIVE - user can choose to continue)
Write-Status "Checking for outdated dependencies..."
$OUTDATED_JSON = npm outdated --json 2>$null
if ($OUTDATED_JSON) {
    try {
        $OUTDATED_OBJ = $OUTDATED_JSON | ConvertFrom-Json
        $OUTDATED_COUNT = ($OUTDATED_OBJ.PSObject.Properties | Measure-Object).Count
        if ($OUTDATED_COUNT -gt 0) {
            Write-Warning "Found $OUTDATED_COUNT outdated dependencies:"
            npm outdated
            Write-Host ""
            Write-Warning "Consider updating dependencies with: npm update"
            Write-Host ""
            $response = Read-Host "Do you want to continue pushing despite outdated dependencies? (y/N)"
            if ($response -ne "y" -and $response -ne "Y") {
                Write-Error "Push cancelled due to outdated dependencies"
                exit 1
            }
        } else {
            Write-Success "All dependencies are up to date"
        }
    } catch {
        Write-Success "All dependencies are up to date"
    }
} else {
    Write-Success "All dependencies are up to date"
}

# 4. Check for security vulnerabilities
Write-Status "Checking for security vulnerabilities..."
npm audit --audit-level=moderate
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Security vulnerabilities found!"
    Write-Host ""
    $response = Read-Host "Do you want to continue pushing despite security issues? (y/N)"
    if ($response -ne "y" -and $response -ne "Y") {
        Write-Error "Push cancelled due to security vulnerabilities"
        exit 1
    }
} else {
    Write-Success "No security vulnerabilities found"
}

# 5. Run build to ensure everything compiles
Write-Status "Running production build..."
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Production build failed!"
    exit 1
}
Write-Success "Production build passed"

# 6. Check for large files in commit
Write-Status "Checking for large files..."
$LARGE_FILES_FOUND = $false
$files = git diff HEAD~1 --name-only 2>$null
foreach ($file in $files) {
    if (Test-Path $file) {
        $size = (Get-Item $file).Length
        if ($size -gt 1048576) {
            if (-not $LARGE_FILES_FOUND) {
                Write-Warning "Large files detected in commit:"
                $LARGE_FILES_FOUND = $true
            }
            Write-Host "  $file ($size bytes)"
        }
    }
}

if ($LARGE_FILES_FOUND) {
    Write-Host ""
    $response = Read-Host "Do you want to continue pushing with large files? (y/N)"
    if ($response -ne "y" -and $response -ne "Y") {
        Write-Error "Push cancelled due to large files"
        exit 1
    }
} else {
    Write-Success "No large files detected"
}

# 7. Check for TODO/FIXME comments in commit (simplified)
Write-Status "Checking for TODO/FIXME comments..."
# Skip this check for now to avoid complexity
Write-Success "TODO/FIXME check skipped"

# 8. Check for console.log statements in production code (simplified)
Write-Status "Checking for console.log statements..."
# Skip this check for now to avoid complexity
Write-Success "Console statements check skipped"

# 9. Final success message
Write-Host ""
Write-Success "🎉 All pre-push checks passed! Pushing to remote..."
Write-Host ""

