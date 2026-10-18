import type {AgentiaPluginHost} from '@copado/agentia-plugin-sdk'
import type {Finding} from '../types.js'

export async function evaluateOrganizationHealth(
  host: AgentiaPluginHost,
): Promise<{
  findings: Finding[]
  summary: {total: number; pass: number; warn: number; fail: number} | null
  passCount: number
}> {
  const findings: Finding[] = []

  try {
    const health = await host.organization.healthCheck()
    if (!health) {
      findings.push({
        severity: 'UNKNOWN',
        category: 'Governance',
        check: 'Organization health',
        evidence: 'The SDK returned an empty health check report.',
        recommendation: 'Check Agentia permissions and rerun the assessment.',
      })
      return {findings, summary: null, passCount: 0}
    }

    const checks = health.checks ?? []
    const passCount = checks.filter(c => c.status === 'pass').length
    const warnCount = checks.filter(c => c.status === 'warn').length
    const failCount = checks.filter(c => c.status === 'fail').length

    for (const check of checks) {
      if (check.status === 'fail') {
        findings.push({
          severity: 'FAIL',
          category: 'Governance',
          check: check.name,
          evidence: check.description ?? `Health check status: ${check.status}`,
          recommendation:
            check.fixGuidance ?? 'Review this failed Copado governance health check.',
        })
      } else if (check.status === 'warn') {
        findings.push({
          severity: 'WARN',
          category: 'Governance',
          check: check.name,
          evidence: check.description ?? 'Copado reported a governance warning.',
          recommendation:
            check.fixGuidance ?? 'Review the governance warning before release.',
        })
      } else if (check.status === 'pending' || check.status === 'unknown') {
        findings.push({
          severity: 'UNKNOWN',
          category: 'Governance',
          check: check.name,
          evidence: `Governance health check status is ${check.status}.`,
          recommendation:
            check.fixGuidance ?? 'Verify this check in Copado before release.',
        })
      }
    }

    const summary = health.summary ?? {
      total: checks.length,
      pass: passCount,
      warn: warnCount,
      fail: failCount,
    }

    return {
      findings,
      summary,
      passCount,
    }
  } catch (err) {
    findings.push({
      severity: 'UNKNOWN',
      category: 'Governance',
      check: 'Organization health',
      evidence: `The SDK could not retrieve organization health information: ${err instanceof Error ? err.message : String(err)}`,
      recommendation:
        'Check Agentia authentication, access permissions, and connectivity, then rerun the assessment.',
    })
    return {findings, summary: null, passCount: 0}
  }
}
