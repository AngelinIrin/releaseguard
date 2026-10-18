import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {evaluatePipelineTopology} from '../dist/checks/pipeline-topology.js'
import {evaluateJobsAndApexTests} from '../dist/checks/jobs-apex-tests.js'
import {evaluateWorkspaceAndGitConflicts} from '../dist/checks/workspace-git.js'
import {evaluateCodeAndMetadataHygiene} from '../dist/checks/code-hygiene.js'
import type {AgentiaPluginHost} from '@copado/agentia-plugin-sdk'
import type {Finding, Severity} from '../dist/types.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('ReleaseGuard Comprehensive Validation Scenarios', () => {
  // Scenario 1: Authentication Validation
  describe('1. Authentication Evidence Validation', () => {
    it('reports WARN for missing optional credentials, and FAIL for unusable credentials', async () => {
      const mockHost = {
        auth: {
          status: () => ({
            cicd: {configured: true, ready: false}, // Configured but not ready -> FAIL
            ai: {configured: false},                // Optional missing -> WARN
            crt: {configured: false},               // Optional missing -> WARN
          }),
        },
        environment: {list: async () => [{id: 'e1', name: 'Dev'}]},
        pipeline: {list: async () => []},
      } as unknown as AgentiaPluginHost

      const result = await evaluatePipelineTopology(mockHost)

      const cicdFinding = result.findings.find(f => f.check === 'cicd credentials')
      const aiFinding = result.findings.find(f => f.check === 'ai credentials')
      const crtFinding = result.findings.find(f => f.check === 'crt credentials')

      // cicd not ready must be FAIL
      assert.ok(cicdFinding)
      assert.equal(cicdFinding?.severity, 'FAIL')
      assert.match(cicdFinding?.evidence ?? '', /configured but not ready/)

      // ai and crt missing must be WARN
      assert.ok(aiFinding)
      assert.equal(aiFinding?.severity, 'WARN')

      assert.ok(crtFinding)
      assert.equal(crtFinding?.severity, 'WARN')
    })
  })

  // Scenario 2: Apex Tests (3 Distinct Cases)
  describe('2. Apex Tests Distinct Cases', () => {
    it('Case A: Successful Apex test produces PASS (0 findings, passCount > 0)', async () => {
      const mockHost = {
        job: {
          list: async () => [
            {
              id: 'job-pass',
              name: 'Apex Test Runner',
              status: 'Success',
              steps: [
                {name: 'Apex Unit Tests', status: 'Success', type: 'ApexTest'},
              ],
            },
          ],
        },
      } as unknown as AgentiaPluginHost

      const result = await evaluateJobsAndApexTests(mockHost)
      assert.equal(result.findings.length, 0)
      assert.equal(result.passCount, 1)
    })

    it('Case B: Failing test run produces FAIL finding', async () => {
      const mockHost = {
        job: {
          list: async () => [
            {
              id: 'job-fail',
              name: 'Apex Test Runner',
              status: 'Failed',
              steps: [
                {name: 'Apex Unit Tests', status: 'Failed', type: 'ApexTest'},
              ],
            },
          ],
        },
      } as unknown as AgentiaPluginHost

      const result = await evaluateJobsAndApexTests(mockHost)
      const failFinding = result.findings.find(f => f.severity === 'FAIL')
      assert.ok(failFinding)
      assert.equal(failFinding?.severity, 'FAIL')
    })

    it('Case C: No test evidence produces UNKNOWN finding with guidance', async () => {
      const mockHost = {
        job: {
          list: async () => [],
        },
      } as unknown as AgentiaPluginHost

      const result = await evaluateJobsAndApexTests(mockHost)
      assert.equal(result.findings.length, 1)
      assert.equal(result.findings[0].severity, 'UNKNOWN')
      assert.match(result.findings[0].evidence, /No recent Copado job executions were found/)
    })
  })

  // Scenario 3: Git Working Tree & Conflicts
  describe('3. Git Status & Uncommitted Metadata', () => {
    it('detects git status cleanly without throwing and reports context', async () => {
      const mockHost = {
        workspace: {
          current: async () => ({
            branch: 'main',
            baseBranch: 'main',
            workItemName: 'US-001',
          }),
        },
      } as unknown as AgentiaPluginHost

      const result = await evaluateWorkspaceAndGitConflicts(mockHost)
      assert.equal(result.activeStory, 'US-001')
      assert.equal(result.branch, 'main')
      // Safe read-only execution
      assert.ok(Array.isArray(result.findings))
    })
  })

  // Scenario 4: Metadata Hygiene Distinction
  describe('4. Metadata Hygiene Distinction', () => {
    it('distinguishes a missing project from a project with missing eslint', async () => {
      // In current directory (which is releaseguard plugin, not a Salesforce project):
      const result = await evaluateCodeAndMetadataHygiene()

      const eslintFinding = result.findings.find(f => f.check === 'ESLint configuration')
      const projectFinding = result.findings.find(f => f.check.includes('Metadata manifest'))

      // Both are checked independently
      assert.ok(eslintFinding, 'Checks for ESLint configuration')
      assert.ok(projectFinding, 'Checks for sfdx-project.json / package.xml')

      assert.equal(eslintFinding?.severity, 'UNKNOWN')
      assert.match(eslintFinding?.evidence ?? '', /No ESLint configuration/)

      assert.equal(projectFinding?.severity, 'UNKNOWN')
      assert.match(projectFinding?.evidence ?? '', /No sfdx-project\.json/)
    })
  })

  // Scenario 5: Overall Status Synthesis
  describe('5. Overall Status Synthesis Logic', () => {
    function computeOverall(findings: Finding[]): Severity | 'REVIEW' | 'INCOMPLETE' {
      if (findings.some(f => f.severity === 'FAIL')) return 'FAIL'
      if (findings.some(f => f.severity === 'WARN')) return 'REVIEW'
      if (findings.some(f => f.severity === 'UNKNOWN')) return 'INCOMPLETE'
      return 'PASS'
    }

    it('returns FAIL when any finding is a FAIL', () => {
      const findings: Finding[] = [
        {severity: 'FAIL', category: 'Quality & Test Coverage', check: 'Apex', evidence: 'failed', recommendation: 'fix'},
        {severity: 'WARN', category: 'Authentication', check: 'ai creds', evidence: 'missing', recommendation: 'add'},
      ]
      assert.equal(computeOverall(findings), 'FAIL')
    })

    it('returns REVIEW when warnings exist but no failures', () => {
      const findings: Finding[] = [
        {severity: 'WARN', category: 'Authentication', check: 'ai creds', evidence: 'missing', recommendation: 'add'},
      ]
      assert.equal(computeOverall(findings), 'REVIEW')
    })

    it('returns INCOMPLETE when only UNKNOWNs exist without warnings or failures', () => {
      const findings: Finding[] = [
        {severity: 'UNKNOWN', category: 'Quality & Test Coverage', check: 'Apex', evidence: 'no jobs', recommendation: 'run tests'},
      ]
      assert.equal(computeOverall(findings), 'INCOMPLETE')
    })

    it('returns PASS when all evaluated checks pass with 0 findings', () => {
      const findings: Finding[] = []
      assert.equal(computeOverall(findings), 'PASS')
    })
  })

  // Scenario 6: Quality Gate Exit Code Policy
  describe('6. Quality Gate Exit Code Policy', () => {
    function computeExitCode(
      overall: Severity | 'REVIEW' | 'INCOMPLETE',
      flags: {strict?: boolean; advisory?: boolean; 'fail-closed'?: boolean} = {},
    ): number {
      if (!flags.advisory) {
        if (overall === 'FAIL') return 1
        if (flags.strict && (overall === 'REVIEW' || overall === 'INCOMPLETE')) return 1
        if (flags['fail-closed'] && overall === 'INCOMPLETE') return 1
      }
      return 0
    }

    it('blocks (exit 1) on FAIL by default', () => {
      assert.equal(computeExitCode('FAIL'), 1)
    })

    it('does not block (exit 0) on REVIEW (warnings) by default (advisory)', () => {
      assert.equal(computeExitCode('REVIEW'), 0)
    })

    it('does not block (exit 0) on INCOMPLETE by default (advisory)', () => {
      assert.equal(computeExitCode('INCOMPLETE'), 0)
    })

    it('does not block (exit 0) on PASS', () => {
      assert.equal(computeExitCode('PASS'), 0)
    })

    it('blocks (exit 1) on REVIEW when --strict is enabled', () => {
      assert.equal(computeExitCode('REVIEW', {strict: true}), 1)
    })

    it('blocks (exit 1) on INCOMPLETE when --strict is enabled', () => {
      assert.equal(computeExitCode('INCOMPLETE', {strict: true}), 1)
    })

    it('blocks (exit 1) on INCOMPLETE when --fail-closed is enabled', () => {
      assert.equal(computeExitCode('INCOMPLETE', {'fail-closed': true}), 1)
    })

    it('permits (exit 0) on REVIEW when --fail-closed is enabled (warnings remain advisory)', () => {
      assert.equal(computeExitCode('REVIEW', {'fail-closed': true}), 0)
    })

    it('does not block (exit 0) even on FAIL when --advisory is enabled', () => {
      assert.equal(computeExitCode('FAIL', {advisory: true}), 0)
    })
  })
})
