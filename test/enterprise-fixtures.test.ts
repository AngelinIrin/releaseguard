import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {evaluateOrganizationHealth} from '../dist/checks/org-health.js'
import {evaluatePipelineTopology} from '../dist/checks/pipeline-topology.js'
import {evaluatePromotionsAndValidations} from '../dist/checks/promotions-validation.js'
import {evaluateJobsAndApexTests} from '../dist/checks/jobs-apex-tests.js'
import type {AgentiaPluginHost} from '@copado/agentia-plugin-sdk'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const fixturesDir = path.join(__dirname, 'fixtures')

describe('Enterprise Fixtures Comprehensive Test Suite', () => {
  // 1. Enterprise Governance Health (18 Rules)
  describe('1. Enterprise Copado Governance Health (18 Rules)', () => {
    it('evaluates enterprise health check with 14 PASS, 2 WARN, and 2 FAIL', async () => {
      const healthData = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, 'enterprise-health.json'), 'utf8'),
      )

      const mockHost = {
        organization: {
          healthCheck: async () => healthData,
        },
      } as unknown as AgentiaPluginHost

      const result = await evaluateOrganizationHealth(mockHost)

      // Summary checks
      assert.equal(result.summary?.total, 18)
      assert.equal(result.passCount, 14)

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
      assert.equal(result.passCount, 1, 'Only PROMO-0004131 (Completed) counts as PASS')

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
})
