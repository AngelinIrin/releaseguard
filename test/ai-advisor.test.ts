import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {askReleaseAdvisor} from '../dist/services/ai-advisor.js'
import type {AgentiaPluginHost} from '@copado/agentia-plugin-sdk'
import type {Finding} from '../dist/types.js'

describe('askReleaseAdvisor', () => {
  it('should return LOW risk level when there are no findings', async () => {
    const mockHost = {} as unknown as AgentiaPluginHost
    const result = await askReleaseAdvisor(mockHost, [], 'PASS')

    assert.ok(result)
    assert.equal(result?.riskLevel, 'LOW')
    assert.match(result?.summary ?? '', /All pre-flight checks passed/)
  })

  it('should return CRITICAL/HIGH risk when findings have FAIL severity', async () => {
    const mockHost = {
      ai: {
        ask: async () => ({
          content: 'Critical deployment blocker detected.\n1. Resolve apex test failures before promotion.\n2. Fix permission sets.',
        }),
      },
    } as unknown as AgentiaPluginHost

    const mockFindings: Finding[] = [
      {
        severity: 'FAIL',
        category: 'Quality & Test Coverage',
        check: 'Apex Tests',
        evidence: '2 tests failed',
        recommendation: 'Fix test methods',
      },
    ]

    const result = await askReleaseAdvisor(mockHost, mockFindings, 'FAIL')
    assert.ok(result)
    assert.equal(result?.riskLevel, 'HIGH')
    assert.ok(result?.recommendations.length > 0)
  })

  it('should fall back gracefully to rule-based advice when AI call throws', async () => {
    const mockHost = {
      ai: {
        ask: async () => {
          throw new Error('AI credentials not configured')
        },
      },
    } as unknown as AgentiaPluginHost

    const mockFindings: Finding[] = [
      {
        severity: 'WARN',
        category: 'Pipeline & Topology',
        check: 'Pipeline Inactive',
        evidence: 'Pipeline is paused',
        recommendation: 'Activate pipeline in Copado',
      },
    ]

    const result = await askReleaseAdvisor(mockHost, mockFindings, 'REVIEW')
    assert.ok(result)
    assert.equal(result?.riskLevel, 'MEDIUM')
    assert.match(result?.summary ?? '', /Automated rule-based risk evaluation/)
    assert.equal(result?.recommendations[0], 'Activate pipeline in Copado')
  })
})
