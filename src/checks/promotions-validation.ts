import type {AgentiaPluginHost} from '@copado/agentia-plugin-sdk'
import type {Finding} from '../types.js'

export async function evaluatePromotionsAndValidations(
  host: AgentiaPluginHost,
): Promise<{
  findings: Finding[]
  passCount: number
  promotionsCount: number | null
}> {
  const findings: Finding[] = []
  let promotionsCount: number | null = null
  let passCount = 0

  try {
    const promotions = await host.promotion.list({pageSize: 200})
    promotionsCount = promotions?.length ?? 0

    if (promotionsCount === 0) {
      // Clean queue is a passing check
      passCount = 1
      return {findings, passCount, promotionsCount: 0}
    }

    for (const promotion of promotions) {
      const status = promotion.status ?? 'Not reported'
      const label = promotion.name ?? promotion.id
      const envContext = promotion.destinationEnvironmentName
        ? ` (to ${promotion.destinationEnvironmentName})`
        : ''

      let hasIssue = false

      if (/\b(fail|failed|failure|error)\b/i.test(status)) {
        hasIssue = true
        findings.push({
          severity: 'FAIL',
          category: 'Promotions & Validations',
          check: `Promotion: ${label}${envContext}`,
          evidence: `Reported promotion status: ${status}`,
          recommendation:
            'Inspect the promotion deployment error log in Copado and resolve the issue before proceeding.',
        })
      } else if (/\b(conflict|merge conflict)\b/i.test(status)) {
        hasIssue = true
        findings.push({
          severity: 'FAIL',
          category: 'Promotions & Validations',
          check: `Promotion conflict: ${label}${envContext}`,
          evidence: `Promotion encountered merge conflicts: ${status}`,
          recommendation:
            'Resolve the Git/metadata conflicts in the feature branch before re-attempting promotion.',
        })
      } else if (/validation\s*fail/i.test(status)) {
        hasIssue = true
        findings.push({
          severity: 'FAIL',
          category: 'Promotions & Validations',
          check: `Validation failure: ${label}${envContext}`,
          evidence: `Deployment validation failed in destination org: ${status}`,
          recommendation:
            'Check Apex test results and metadata dependencies in the destination environment.',
        })
      } else if (/cancelled|aborted|stopped/i.test(status)) {
        hasIssue = true
        findings.push({
          severity: 'WARN',
          category: 'Promotions & Validations',
          check: `Promotion: ${label}${envContext}`,
          evidence: `Promotion was cancelled or aborted: ${status}`,
          recommendation:
            'Confirm if this promotion should be rerun or abandoned.',
        })
      }

      if (!hasIssue) {
        passCount++
      }
    }
  } catch (err) {
    findings.push({
      severity: 'UNKNOWN',
      category: 'Promotions & Validations',
      check: 'Promotions and validation status',
      evidence: `The SDK could not retrieve promotions data: ${err instanceof Error ? err.message : String(err)}`,
      recommendation:
        'Verify Copado promotion permissions or check if promotion records exist.',
    })
  }

  return {findings, passCount, promotionsCount}
}
