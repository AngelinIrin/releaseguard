import type {AgentiaPluginHost} from '@copado/agentia-plugin-sdk'
import type {Finding} from '../types.js'

export async function evaluateJobsAndApexTests(
  host: AgentiaPluginHost,
): Promise<{
  findings: Finding[]
  jobsCount: number | null
}> {
  const findings: Finding[] = []
  let jobsCount: number | null = null

  try {
    const jobs = await host.job.list({pageSize: 20})
    jobsCount = jobs?.length ?? 0

    if (jobsCount === 0) {
      findings.push({
        severity: 'UNKNOWN',
        category: 'Quality & Test Coverage',
        check: 'Copado test execution history',
        evidence: 'No recent Copado job executions were found.',
        recommendation:
          'Ensure Apex test suites are executed in the source sandbox or validated via Copado before promotion.',
      })
      return {findings, jobsCount: 0}
    }

    let foundTestStep = false

    for (const job of jobs) {
      const jobLabel = job.name ?? job.id
      const template = job.templateName ? ` (${job.templateName})` : ''

      // Check overall job status
      if (job.status && /\b(fail|failed|failure|error)\b/i.test(job.status)) {
        findings.push({
          severity: 'FAIL',
          category: 'Quality & Test Coverage',
          check: `Job execution: ${jobLabel}${template}`,
          evidence: `Job finished with status: ${job.status}`,
          recommendation:
            'Review the failed job execution in Copado before proceeding with the release.',
        })
      }

      // Check step-level statuses if available
      if (job.steps && job.steps.length > 0) {
        for (const step of job.steps) {
          const stepName = step.name ?? step.type ?? 'Execution step'
          const isTestStep = /test|apex|coverage|quality/i.test(stepName) || /test|apex/i.test(step.type ?? '')

          if (isTestStep) {
            foundTestStep = true
            if (step.status && /\b(fail|failed|failure|error)\b/i.test(step.status)) {
              findings.push({
                severity: 'FAIL',
                category: 'Quality & Test Coverage',
                check: `Apex Test / Quality step: ${stepName} in ${jobLabel}`,
                evidence: `Step failed with status: ${step.status}`,
                recommendation:
                  'Fix failing unit tests or address code coverage deficits in the source environment.',
              })
            }
          }
        }
      }
    }

    if (!foundTestStep && findings.length === 0) {
      findings.push({
        severity: 'UNKNOWN',
        category: 'Quality & Test Coverage',
        check: 'Apex test verification',
        evidence: 'Recent jobs did not contain explicit Apex test execution steps.',
        recommendation:
          'Run a test execution job in Copado or validate test coverage via Salesforce CLI before release.',
      })
    }
  } catch (err) {
    findings.push({
      severity: 'UNKNOWN',
      category: 'Quality & Test Coverage',
      check: 'Copado execution jobs & test results',
      evidence: `Could not retrieve job executions from the SDK: ${err instanceof Error ? err.message : String(err)}`,
      recommendation:
        'Verify job read permissions in Copado or check Copado CI/CD service configuration.',
    })
  }

  return {findings, jobsCount}
}
