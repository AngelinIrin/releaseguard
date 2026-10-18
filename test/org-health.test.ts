import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {evaluateOrganizationHealth} from '../dist/checks/org-health.js'
import type {AgentiaPluginHost} from '@copado/agentia-plugin-sdk'

describe('evaluateOrganizationHealth', () => {
  it('should return PASS when all governance checks pass', async () => {
    const mockHost = {
      organization: {
        healthCheck: async () => ({
          checks: [
            {checkId: 'c1', name: 'SFDX Bundle', status: 'pass'},
            {checkId: 'c2', name: 'Functions Enabled', status: 'pass'},
          ],
          summary: {total: 2, pass: 2, warn: 0, fail: 0},
        }),
      },
    } as unknown as AgentiaPluginHost

    const result = await evaluateOrganizationHealth(mockHost)
    assert.equal(result.findings.length, 0)
    assert.equal(result.summary?.pass, 2)
    assert.equal(result.summary?.fail, 0)
  })

  it('should flag FAIL when governance checks fail with guidance', async () => {
    const mockHost = {
      organization: {
        healthCheck: async () => ({
          checks: [
            {
              checkId: 'c1',
              name: 'Flow User Permission',
              status: 'fail',
              description: 'Missing flow permission',
              fixGuidance: 'Assign Flow User to deployer profile',
            },
          ],
          summary: {total: 1, pass: 0, warn: 0, fail: 1},
        }),
      },
    } as unknown as AgentiaPluginHost

    const result = await evaluateOrganizationHealth(mockHost)
    assert.equal(result.findings.length, 1)
    assert.equal(result.findings[0].severity, 'FAIL')
    assert.equal(result.findings[0].check, 'Flow User Permission')
    assert.equal(result.findings[0].recommendation, 'Assign Flow User to deployer profile')
  })

  it('should handle SDK errors gracefully and return UNKNOWN', async () => {
    const mockHost = {
      organization: {
        healthCheck: async () => {
          throw new Error('Network timeout')
        },
      },
    } as unknown as AgentiaPluginHost

    const result = await evaluateOrganizationHealth(mockHost)
    assert.equal(result.findings.length, 1)
    assert.equal(result.findings[0].severity, 'UNKNOWN')
    assert.match(result.findings[0].evidence, /Network timeout/)
  })
})
