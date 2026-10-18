import fs from 'node:fs'
import path from 'node:path'
import {execSync} from 'node:child_process'
import type {Finding} from '../types.js'

export async function evaluateCodeAndMetadataHygiene(): Promise<{
  findings: Finding[]
}> {
  const findings: Finding[] = []
  const cwd = process.cwd()

  // 1. ESLint & Static Analysis Check
  const hasEslintConfig =
    fs.existsSync(path.join(cwd, '.eslintrc.json')) ||
    fs.existsSync(path.join(cwd, '.eslintrc.js')) ||
    fs.existsSync(path.join(cwd, '.eslintrc.yml')) ||
    fs.existsSync(path.join(cwd, 'eslint.config.js')) ||
    fs.existsSync(path.join(cwd, 'eslint.config.mjs'))

  if (hasEslintConfig) {
    try {
      // Run eslint in read-only check mode on modified or staged files
      const lintOutput = execSync('npx eslint . --ext .js,.ts --format json', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 10000,
      })

      const lintResults = JSON.parse(lintOutput)
      const errorCount = lintResults.reduce((acc: number, r: any) => acc + (r.errorCount || 0), 0)
      const warningCount = lintResults.reduce((acc: number, r: any) => acc + (r.warningCount || 0), 0)

      if (errorCount > 0) {
        findings.push({
          severity: 'FAIL',
          category: 'Code & Lint Hygiene',
          check: 'ESLint static code analysis',
          evidence: `Found ${errorCount} lint error(s) and ${warningCount} warning(s) in project code.`,
          recommendation: 'Fix ESLint errors or run `npx eslint . --fix` before promoting code.',
        })
      } else if (warningCount > 0) {
        findings.push({
          severity: 'WARN',
          category: 'Code & Lint Hygiene',
          check: 'ESLint static code analysis',
          evidence: `Found ${warningCount} lint warning(s) across project files.`,
          recommendation: 'Review ESLint warnings to ensure clean code standards.',
        })
      }
    } catch {
      findings.push({
        severity: 'WARN',
        category: 'Code & Lint Hygiene',
        check: 'ESLint execution',
        evidence: 'ESLint reported syntax or rule violations during scan.',
        recommendation: 'Run `npx eslint .` to review and resolve linting issues.',
      })
    }
  } else {
    findings.push({
      severity: 'UNKNOWN',
      category: 'Code & Lint Hygiene',
      check: 'ESLint configuration',
      evidence: 'No ESLint configuration file detected in the current directory.',
      recommendation:
        'Set up ESLint with `@salesforce/eslint-config-lwc` to catch lightning web component errors before promotion.',
    })
  }

  // 2. Metadata Dependency Pre-check (Package.xml / sfdx-project.json)
  const sfdxProjectJson = path.join(cwd, 'sfdx-project.json')
  const packageXml = path.join(cwd, 'manifest', 'package.xml')

  if (fs.existsSync(sfdxProjectJson)) {
    try {
      const content = fs.readFileSync(sfdxProjectJson, 'utf8')
      const parsed = JSON.parse(content)
      const dependencies = parsed.packageDirectories?.[0]?.dependencies
      if (Array.isArray(dependencies) && dependencies.length > 0) {
        // Dependencies are declared
        const missingDeps = dependencies.filter((d: any) => !d.package || !d.versionNumber)
        if (missingDeps.length > 0) {
          findings.push({
            severity: 'WARN',
            category: 'Code & Lint Hygiene',
            check: 'Package directory dependencies',
            evidence: `${missingDeps.length} dependency entry in sfdx-project.json is missing required attributes.`,
            recommendation: 'Verify package dependency version numbers in sfdx-project.json.',
          })
        }
      }
    } catch {
      findings.push({
        severity: 'WARN',
        category: 'Code & Lint Hygiene',
        check: 'sfdx-project.json syntax',
        evidence: 'Could not parse sfdx-project.json.',
        recommendation: 'Ensure sfdx-project.json is valid JSON.',
      })
    }
  } else if (!fs.existsSync(packageXml)) {
    findings.push({
      severity: 'UNKNOWN',
      category: 'Code & Lint Hygiene',
      check: 'Metadata manifest & dependencies',
      evidence: 'No sfdx-project.json or manifest/package.xml found in current directory.',
      recommendation:
        'Run the release assessment from within your Salesforce project directory to enable manifest dependency checks.',
    })
  }

  return {findings}
}
