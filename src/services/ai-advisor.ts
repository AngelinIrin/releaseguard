import type {AgentiaPluginHost} from '@copado/agentia-plugin-sdk'
import type {Finding} from '../types.js'

export async function askReleaseAdvisor(
  host: AgentiaPluginHost,
  findings: Finding[],
  overall: string,
): Promise<{
  summary: string
  recommendations: string[]
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
} | null> {
  const failCount = findings.filter(f => f.severity === 'FAIL').length
  const warnCount = findings.filter(f => f.severity === 'WARN').length

  const riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' =
    failCount > 0 ? (failCount > 2 ? 'CRITICAL' : 'HIGH') : warnCount > 0 ? 'MEDIUM' : 'LOW'

  if (findings.length === 0) {
    return {
      summary: 'All pre-flight checks passed. The release package is ready for deployment.',
      recommendations: ['Proceed with promotion in accordance with your standard change window.'],
      riskLevel: 'LOW',
    }
  }

  try {
    const issuesSummary = findings
      .map(f => `[${f.severity}] ${f.check}: ${f.evidence}`)
      .slice(0, 10)
      .join('\n')

    const prompt = `You are a Copado Salesforce DevOps Release Architect. Review these pre-flight release assessment findings and provide:
1. A 2-sentence executive risk assessment.
2. The top 3 prioritized remediation actions for the release manager.

Findings:
${issuesSummary}`

    const response = await host.ai.ask({
      agent: 'release',
      prompt,
    })

    if (response?.content) {
      const lines = response.content.split('\n').map(l => l.trim()).filter(Boolean)
      const recommendations = lines
        .filter(l => /^(\d+\.|\-|\*)\s+/.test(l))
        .map(l => l.replace(/^(\d+\.|\-|\*)\s+/, ''))
        .slice(0, 4)

      return {
        summary: response.content.split('\n\n')[0] ?? 'AI analysis completed.',
        recommendations:
          recommendations.length > 0
            ? recommendations
            : ['Review high-severity findings and resolve identified blockers.'],
        riskLevel,
      }
    }
  } catch (err) {
    // Fall through to rule-based fallback
  }

  // Graceful fallback when AI returns empty, credentials not configured, or call throws
  return {
    summary: `Automated rule-based risk evaluation: ${failCount} blocker(s) and ${warnCount} warning(s) detected.`,
    recommendations: findings
      .filter(f => f.severity === 'FAIL' || f.severity === 'WARN')
      .slice(0, 3)
      .map(f => f.recommendation),
    riskLevel,
  }
}
