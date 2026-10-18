import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {execSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {evaluateOrganizationHealth} from '../dist/checks/org-health.js'
import {evaluatePipelineTopology} from '../dist/checks/pipeline-topology.js'
import {evaluatePromotionsAndValidations} from '../dist/checks/promotions-validation.js'
import {evaluateJobsAndApexTests} from '../dist/checks/jobs-apex-tests.js'
import {evaluateWorkspaceAndGitConflicts} from '../dist/checks/workspace-git.js'
import type {AgentiaPluginHost} from '@copado/agentia-plugin-sdk'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const fixturesDir = path.join(__dirname, 'fixtures')

describe('Enterprise Integration & Real Git Scenarios Test Suite', () => {
  // 1. Enterprise Governance Health (18 Rules Evaluator Integration)
  describe('1. Enterprise Copado Governance Health (18 Rules)', () => {
    it('evaluates all 18 enterprise rules and verifies summary and findings', async () => {
      const healthData = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, 'enterprise-health.json'), 'utf8'),
      )

      const mockHost = {
        organization: {
          healthCheck: async () => healthData,
        },
      } as unknown as AgentiaPluginHost

      const result = await evaluateOrganizationHealth(mockHost)

      // Summary assertions - all 18 rules accounted for
      assert.ok(result.summary)
      assert.equal(result.summary.total, 18)
      assert.equal(result.summary.pass, 14)
      assert.equal(result.summary.warn, 2)
      assert.equal(result.summary.fail, 2)
      assert.equal(result.passCount, 14)

      // Only non-passing rules produce findings in ReleaseGuard
      assert.equal(result.findings.length, 4)

      const failFindings = result.findings.filter(f => f.severity === 'FAIL')
      const warnFindings = result.findings.filter(f => f.severity === 'WARN')

      assert.equal(failFindings.length, 2, 'Must detect 2 failing enterprise governance rules')
      assert.equal(warnFindings.length, 2, 'Must detect 2 warning enterprise governance rules')

      // Specific rule checks
      const rollbackFail = failFindings.find(f => f.check.includes('Rollback'))
      assert.ok(rollbackFail)
      assert.match(rollbackFail.evidence, /automated rollback/)

      const destructiveFail = failFindings.find(f => f.check.includes('Destructive'))
      assert.ok(destructiveFail)
      assert.match(destructiveFail.evidence, /destructiveChanges\.xml/)

      const staleWarn = warnFindings.find(f => f.check.includes('Stale'))
      assert.ok(staleWarn)
      assert.match(staleWarn.evidence, /30 calendar days/)

      const apiWarn = warnFindings.find(f => f.check.includes('API Consumption'))
      assert.ok(apiWarn)
      assert.match(apiWarn.evidence, /82% of org threshold/)
    })
  })

  // 2. Enterprise Promotions & Deployment Validations
  describe('2. Enterprise Promotions & Deployment Validations', () => {
    it('detects Validation Failed, Merge Conflict, and Cancelled promotions from enterprise fixtures', async () => {
      const promotionsData = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, 'enterprise-promotions.json'), 'utf8'),
      )

      const mockHost = {
        promotion: {
          list: async () => promotionsData,
        },
      } as unknown as AgentiaPluginHost

      const result = await evaluatePromotionsAndValidations(mockHost)

      assert.equal(result.promotionsCount, 4)
      assert.equal(result.passCount, 1, 'Only PROMO-0004131 (Completed) counts as clean PASS')

      const failFindings = result.findings.filter(f => f.severity === 'FAIL')
      const warnFindings = result.findings.filter(f => f.severity === 'WARN')

      // Validation Failed -> FAIL
      const validationFailed = failFindings.find(f => f.check.includes('PROMO-0004128'))
      assert.ok(validationFailed)
      assert.match(validationFailed.evidence, /Validation Failed/)

      // Merge Conflict -> FAIL
      const mergeConflict = failFindings.find(f => f.check.includes('PROMO-0004129'))
      assert.ok(mergeConflict)
      assert.match(mergeConflict.evidence, /Merge Conflict Detected/)

      // Cancelled -> WARN
      const cancelled = warnFindings.find(f => f.check.includes('PROMO-0004130'))
      assert.ok(cancelled)
      assert.match(cancelled.evidence, /Cancelled/)
    })
  })

  // 3. Enterprise Execution Jobs & Apex Unit Test Deficits
  describe('3. Enterprise Execution Jobs & Apex Unit Test Deficits', () => {
    it('flags failing unit tests and coverage deficits from enterprise job history', async () => {
      const jobsData = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, 'enterprise-jobs.json'), 'utf8'),
      )

      const mockHost = {
        job: {
          list: async () => jobsData,
        },
      } as unknown as AgentiaPluginHost

      const result = await evaluateJobsAndApexTests(mockHost)

      assert.equal(result.jobsCount, 3)

      const failFindings = result.findings.filter(f => f.severity === 'FAIL')
      assert.ok(failFindings.length >= 2, 'Should flag failed overall job and failing Apex test steps')

      // Flag failing unit tests step
      const apexStepFail = failFindings.find(f => f.check.includes('Apex Unit Tests'))
      assert.ok(apexStepFail)
      assert.match(apexStepFail.recommendation, /failing unit tests/)

      // 2 passing jobs (CheckOnly and PMD Scanner) should be tallied in passCount
      assert.equal(result.passCount, 2)
    })
  })

  // 4. Enterprise Multi-Stage Pipeline Topology
  describe('4. Enterprise Multi-Stage Pipeline Topology', () => {
    it('evaluates multi-stage enterprise pipelines and detects inactive/broken routes', async () => {
      const pipelineData = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, 'enterprise-pipelines.json'), 'utf8'),
      )

      const mockHost = {
        auth: {
          status: () => ({
            cicd: {configured: true, ready: true},
            ai: {configured: true, ready: true},
            crt: {configured: false}, // CRT missing -> WARN
          }),
        },
        environment: {
          list: async () => pipelineData.environments,
        },
        pipeline: {
          list: async () => pipelineData.pipelines,
          get: async (id: string) => {
            const found = pipelineData.pipelines.find((p: {id: string}) => p.id === id)
            if (!found) throw new Error(`Pipeline ${id} not found`)
            return found
          },
        },
      } as unknown as AgentiaPluginHost

      const result = await evaluatePipelineTopology(mockHost)

      assert.equal(result.environmentsCount, 6)
      assert.equal(result.pipelinesCount, 3)

      // 1. Enterprise Financial Services Pipeline is healthy (5 connections complete)
      // 2. Legacy CRM Migration Pipeline is inactive -> WARN
      const inactivePipeline = result.findings.find(f => f.check.includes('Legacy CRM Migration Pipeline'))
      assert.ok(inactivePipeline)
      assert.equal(inactivePipeline.severity, 'WARN')

      // 3. Partner Portal Sandbox Pipeline has broken connection (missing destination) -> UNKNOWN finding
      const brokenConnection = result.findings.find(f => f.check.includes('Partner Portal Sandbox Pipeline'))
      assert.ok(brokenConnection)
      assert.equal(brokenConnection.severity, 'UNKNOWN')

      // 4. CRT credentials missing -> WARN
      const crtWarn = result.findings.find(f => f.check === 'crt credentials')
      assert.ok(crtWarn)
      assert.equal(crtWarn.severity, 'WARN')

      // Healthy pipeline counted in passCount
      assert.ok(result.passCount >= 3)
    })
  })

  // 5. Genuine Git Repository Conflict & Uncommitted Changes Test
  describe('5. Genuine Git Repository 3-Way Merge Conflict Test', () => {
    it('creates a temporary Git repo with genuinely conflicting changes and detects conflict via git merge-tree', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-git-conflict-'))

      try {
        // Initialize real Git repository
        execSync('git init -b main', {cwd: tempDir, stdio: 'ignore'})
        execSync('git config user.name "ReleaseGuard Test"', {cwd: tempDir, stdio: 'ignore'})
        execSync('git config user.email "test@releaseguard.dev"', {cwd: tempDir, stdio: 'ignore'})

        // 1. Commit initial base file on main
        const baseContent = [
          'public with sharing class PaymentGatewayService {',
          '    public static HttpResponse sendPayment(Decimal amount) {',
          '        HttpRequest req = new HttpRequest();',
          '        req.setEndpoint("https://api.gateway.example.com/v1/charge");',
          '        return new Http().send(req);',
          '    }',
          '}',
        ].join('\n')
        fs.writeFileSync(path.join(tempDir, 'PaymentGatewayService.cls'), baseContent, 'utf8')
        execSync('git add .', {cwd: tempDir, stdio: 'ignore'})
        execSync('git commit -m "feat: initial PaymentGatewayService on main"', {cwd: tempDir, stdio: 'ignore'})

        // 2. Branch out to feature branch and change line 4
        execSync('git checkout -b feature/US-0000024', {cwd: tempDir, stdio: 'ignore'})
        const featureContent = [
          'public with sharing class PaymentGatewayService {',
          '    public static HttpResponse sendPayment(Decimal amount) {',
          '        HttpRequest req = new HttpRequest();',
          '        req.setEndpoint("https://api.v2.feature-endpoint.example.com/v2/charge");',
          '        return new Http().send(req);',
          '    }',
          '}',
        ].join('\n')
        fs.writeFileSync(path.join(tempDir, 'PaymentGatewayService.cls'), featureContent, 'utf8')
        execSync('git add .', {cwd: tempDir, stdio: 'ignore'})
        execSync('git commit -m "feat: updated endpoint to v2 feature endpoint"', {cwd: tempDir, stdio: 'ignore'})

        // 3. Switch back to main and commit a conflicting change on line 4
        execSync('git checkout main', {cwd: tempDir, stdio: 'ignore'})
        const conflictingMainContent = [
          'public with sharing class PaymentGatewayService {',
          '    public static HttpResponse sendPayment(Decimal amount) {',
          '        HttpRequest req = new HttpRequest();',
          '        req.setEndpoint("https://api.conflicting-security-patch.example.com/secure/charge");',
          '        return new Http().send(req);',
          '    }',
          '}',
        ].join('\n')
        fs.writeFileSync(path.join(tempDir, 'PaymentGatewayService.cls'), conflictingMainContent, 'utf8')
        execSync('git add .', {cwd: tempDir, stdio: 'ignore'})
        execSync('git commit -m "fix: updated endpoint to conflicting security patch"', {cwd: tempDir, stdio: 'ignore'})

        // 4. Return to feature branch
        execSync('git checkout feature/US-0000024', {cwd: tempDir, stdio: 'ignore'})

        // 5. Invoke ReleaseGuard's real evaluateWorkspaceAndGitConflicts in the temporary repo
        const mockHost = {
          workspace: {
            current: async () => ({
              branch: 'feature/US-0000024',
              baseBranch: 'main',
              workItemName: 'US-0000024',
            }),
          },
        } as unknown as AgentiaPluginHost

        const result = await evaluateWorkspaceAndGitConflicts(mockHost, {cwd: tempDir})

        // Verify that ReleaseGuard's git merge-tree detected the genuine 3-way conflict!
        const conflictFinding = result.findings.find(f => f.severity === 'FAIL' && f.check.includes('Metadata merge conflict'))
        assert.ok(conflictFinding, 'Must detect genuine 3-way merge conflict between feature/US-0000024 and main')
        assert.equal(conflictFinding?.severity, 'FAIL')
        assert.match(conflictFinding?.evidence ?? '', /conflicting metadata changes with target base branch 'main'/)
        assert.match(conflictFinding?.recommendation ?? '', /resolve merge conflicts before promoting/)

        // 6. Test Dirty/Uncommitted metadata detection
        fs.writeFileSync(path.join(tempDir, 'UnsavedMetadata.cls'), 'public class UnsavedMetadata {}', 'utf8')
        const dirtyResult = await evaluateWorkspaceAndGitConflicts(mockHost, {cwd: tempDir})

        const dirtyFinding = dirtyResult.findings.find(f => f.severity === 'WARN' && f.check.includes('Uncommitted metadata'))
        assert.ok(dirtyFinding, 'Must detect dirty working tree when untracked files are present')
        assert.equal(dirtyFinding?.severity, 'WARN')
        assert.match(dirtyFinding?.evidence ?? '', /Working tree has 1 uncommitted or untracked changes/)
      } finally {
        // Safe cleanup
        try {
          fs.rmSync(tempDir, {recursive: true, force: true})
        } catch {}
      }
    })
  })
})
