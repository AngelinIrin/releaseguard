import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {evaluatePipelineTopology} from '../dist/checks/pipeline-topology.js'
import type {AgentiaPluginHost} from '@copado/agentia-plugin-sdk'

describe('evaluatePipelineTopology', () => {
  it('should flag WARN when a pipeline is marked inactive', async () => {
    const mockHost = {
      auth: {
        status: () => ({
          cicd: {configured: true, ready: true},
          ai: {configured: true, ready: true},
          crt: {configured: true, ready: true},
        }),
      },
      environment: {
        list: async () => [{id: 'env-1', name: 'Dev'}],
      },
      pipeline: {
        list: async () => [
          {id: 'pipe-1', name: 'Main Pipeline', active: false},
        ],
        get: async () => ({
          id: 'pipe-1',
          name: 'Main Pipeline',
          active: false,
          connections: [
            {
              branch: 'dev',
              sourceEnvironment: {id: 'e1', name: 'Dev'},
              destinationEnvironment: {id: 'e2', name: 'QA'},
            },
          ],
        }),
      },
    } as unknown as AgentiaPluginHost

    const result = await evaluatePipelineTopology(mockHost)
    const inactiveFinding = result.findings.find(f => f.check.includes('Main Pipeline'))
    assert.ok(inactiveFinding)
    assert.equal(inactiveFinding?.severity, 'WARN')
    assert.match(inactiveFinding?.evidence ?? '', /marked inactive/)
  })

  it('should flag UNKNOWN when pipeline connections are incomplete', async () => {
    const mockHost = {
      auth: {
        status: () => ({}),
      },
      environment: {
        list: async () => [{id: 'env-1', name: 'Dev'}],
      },
      pipeline: {
        list: async () => [{id: 'pipe-2', name: 'Broken Pipeline', active: true}],
        get: async () => ({
          id: 'pipe-2',
          name: 'Broken Pipeline',
          connections: [
            // Missing branch
            {
              sourceEnvironment: {id: 'e1', name: 'Dev'},
              destinationEnvironment: {id: 'e2', name: 'QA'},
            },
          ],
        }),
      },
    } as unknown as AgentiaPluginHost

    const result = await evaluatePipelineTopology(mockHost)
    const connectionFinding = result.findings.find(f => f.check.includes('Pipeline connections'))
    assert.ok(connectionFinding)
    assert.equal(connectionFinding?.severity, 'UNKNOWN')
    assert.match(connectionFinding?.evidence ?? '', /incomplete source, destination, or branch details/)
  })
})
