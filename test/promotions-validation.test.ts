import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {evaluatePromotionsAndValidations} from '../dist/checks/promotions-validation.js'
import type {AgentiaPluginHost} from '@copado/agentia-plugin-sdk'

describe('evaluatePromotionsAndValidations', () => {
  it('should return 0 findings when promotions list is empty', async () => {
    const mockHost = {
      promotion: {
        list: async () => [],
      },
    } as unknown as AgentiaPluginHost

    const result = await evaluatePromotionsAndValidations(mockHost)
    assert.equal(result.findings.length, 0)
    assert.equal(result.promotionsCount, 0)
  })

  it('should flag FAIL when promotion has failed status or validation failure', async () => {
    const mockHost = {
      promotion: {
        list: async () => [
          {
            id: 'p1',
            name: 'PROMO-001',
            status: 'Validation Failed',
            destinationEnvironmentName: 'UAT',
          },
          {
            id: 'p2',
            name: 'PROMO-002',
            status: 'Completed',
            destinationEnvironmentName: 'QA',
          },
        ],
      },
    } as unknown as AgentiaPluginHost

    const result = await evaluatePromotionsAndValidations(mockHost)
    assert.equal(result.findings.length, 1)
    assert.equal(result.findings[0].severity, 'FAIL')
    assert.match(result.findings[0].check, /PROMO-001/)
    assert.match(result.findings[0].evidence, /Validation Failed/)
  })

  it('should flag FAIL when promotion encounters merge conflicts', async () => {
    const mockHost = {
      promotion: {
        list: async () => [
          {
            id: 'p-conflict',
            name: 'PROMO-003',
            status: 'Merge Conflict Detected',
            destinationEnvironmentName: 'Integration',
          },
        ],
      },
    } as unknown as AgentiaPluginHost

    const result = await evaluatePromotionsAndValidations(mockHost)
    assert.equal(result.findings.length, 1)
    assert.equal(result.findings[0].severity, 'FAIL')
    assert.match(result.findings[0].check, /conflict/i)
  })
})
