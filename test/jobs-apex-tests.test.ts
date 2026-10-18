import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {evaluateJobsAndApexTests} from '../dist/checks/jobs-apex-tests.js'
import type {AgentiaPluginHost} from '@copado/agentia-plugin-sdk'

describe('evaluateJobsAndApexTests', () => {
  it('should flag UNKNOWN when no jobs exist', async () => {
    const mockHost = {
      job: {
        list: async () => [],
      },
    } as unknown as AgentiaPluginHost

    const result = await evaluateJobsAndApexTests(mockHost)
    assert.equal(result.findings.length, 1)
    assert.equal(result.findings[0].severity, 'UNKNOWN')
    assert.match(result.findings[0].recommendation, /Ensure Apex test suites are executed/)
  })

  it('should flag FAIL when a job execution status failed', async () => {
    const mockHost = {
      job: {
        list: async () => [
          {
            id: 'job-101',
            name: 'Deploy Job #101',
            templateName: 'Standard Deployment',
            status: 'Failed',
          },
        ],
      },
    } as unknown as AgentiaPluginHost

    const result = await evaluateJobsAndApexTests(mockHost)
    assert.equal(result.findings.length, 1)
    assert.equal(result.findings[0].severity, 'FAIL')
    assert.match(result.findings[0].check, /Deploy Job #101/)
  })

  it('should flag FAIL when an Apex test step failed in a job', async () => {
    const mockHost = {
      job: {
        list: async () => [
          {
            id: 'job-102',
            name: 'Validation Job #102',
            status: 'Completed with Errors',
            steps: [
              {name: 'Apex Test Execution', status: 'Failed', type: 'ApexTest'},
              {name: 'Static Scan', status: 'Success', type: 'Scanner'},
            ],
          },
        ],
      },
    } as unknown as AgentiaPluginHost

    const result = await evaluateJobsAndApexTests(mockHost)
    const testFinding = result.findings.find(f => f.check.includes('Apex Test'))
    assert.ok(testFinding)
    assert.equal(testFinding?.severity, 'FAIL')
    assert.match(testFinding?.recommendation ?? '', /Fix failing unit tests/)
  })
})
