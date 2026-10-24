import * as fs from 'node:fs'
import * as path from 'node:path'
import type {AgentiaPluginHost} from '@copado/agentia-plugin-sdk'
import type {Finding} from '../types.js'

export async function evaluateJobsAndApexTests(
  host: AgentiaPluginHost,
): Promise<{
  findings: Finding[]
  passCount: number
  jobsCount: number | null
}> {
  const findings: Finding[] = []
  let jobsCount: number | null = null
  let passCount = 0

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
      return {findings, passCount: 0, jobsCount: 0}
    }

    let foundTestStep = false

    for (const job of jobs) {
      const jobLabel = job.name ?? job.id
      const template = job.templateName ? ` (${job.templateName})` : ''
      let jobFailed = false

      // Check overall job status
      if (job.status && /\b(fail|failed|failure|error)\b/i.test(job.status)) {
        jobFailed = true
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
              jobFailed = true
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

      if (!jobFailed) {
        passCount++
      }
    }

    if (!foundTestStep && findings.length === 0) {
      let localEvidenceFound = false
      const candidatePaths = [
        path.join(process.cwd(), '.agentia', 'test-evidence.json'),
        path.join(process.cwd(), 'test-evidence.json'),
      ]

      for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
          try {
            const data = JSON.parse(fs.readFileSync(p, 'utf8'))
            localEvidenceFound = true
            if (data.status === 'Failed' || (typeof data.testsFailed === 'number' && data.testsFailed > 0)) {
              findings.push({
                severity: 'FAIL',
                category: 'Quality & Test Coverage',
                check: 'Local Apex test execution evidence',
                evidence: `Local test run reported failures: ${data.testsFailed ?? 1} test(s) failed`,
                recommendation: 'Fix failing unit tests in your local sandbox before promotion.',
              })
            } else {
              passCount++
              foundTestStep = true
            }
            break
          } catch {
            // Ignore parse errors and fall through
          }
        }
      }

      if (!localEvidenceFound) {
        findings.push({
          severity: 'UNKNOWN',
          category: 'Quality & Test Coverage',
          check: 'Apex test verification',
          evidence: 'Recent jobs did not contain explicit Apex test execution steps.',
          recommendation:
            'Run a test execution job in Copado or validate test coverage via Salesforce CLI before release.',
        })
      }
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

  return {findings, passCount, jobsCount}
}
