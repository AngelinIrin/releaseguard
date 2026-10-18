import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {evaluateCodeAndMetadataHygiene} from '../dist/checks/code-hygiene.js'

describe('evaluateCodeAndMetadataHygiene', () => {
  it('should return UNKNOWN with setup guidance when no eslint config exists', async () => {
    const result = await evaluateCodeAndMetadataHygiene()
    assert.ok(result.findings.length > 0)
    const eslintFinding = result.findings.find(f => f.check.includes('ESLint'))
    assert.ok(eslintFinding)
    assert.equal(eslintFinding?.severity, 'UNKNOWN')
    assert.match(eslintFinding?.recommendation ?? '', /@salesforce\/eslint-config-lwc/)
  })
})
