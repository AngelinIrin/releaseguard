import {AgentiaCommand, getAgentiaHost} from '@copado/agentia-plugin-sdk'
import {Flags} from '@oclif/core'
import {evaluateOrganizationHealth} from '../../checks/org-health.js'
import {evaluatePipelineTopology} from '../../checks/pipeline-topology.js'
import {evaluatePromotionsAndValidations} from '../../checks/promotions-validation.js'
import {evaluateJobsAndApexTests} from '../../checks/jobs-apex-tests.js'
import {evaluateWorkspaceAndGitConflicts} from '../../checks/workspace-git.js'
import {evaluateCodeAndMetadataHygiene} from '../../checks/code-hygiene.js'
import {askReleaseAdvisor} from '../../services/ai-advisor.js'
import type {CategorySummary, CheckCategory, Finding, ReleaseGuardReport, Severity} from '../../types.js'

const REQUIRED = [
  'auth.status',
  'format.table',
  'organization.healthCheck',
  'pipeline.list',
  'pipeline.get',
  'promotion.list',
  'environment.list',
  'job.list',
  'workspace.current',
  'ai.ask',
] as const

export default class Assess extends AgentiaCommand {
  static override description =
    'Assess Salesforce release readiness using unified Copado evidence, governance, and Git context'

  static override examples = [
    '<%= config.bin %> releaseguard assess',
    '<%= config.bin %> releaseguard assess --ai',
    '<%= config.bin %> releaseguard assess --verbose',
    '<%= config.bin %> releaseguard assess --json',
  ]

  static override flags = {
    ai: Flags.boolean({
      char: 'a',
      description: 'Run Agentia AI release risk synthesis and remediation advice',
      default: false,
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Include detailed diagnostic evidence in output',
      default: false,
    }),
    strict: Flags.boolean({
      char: 's',
      description: 'Strict mode: fail on warnings as well as blocking failures',
      default: false,
    }),
    advisory: Flags.boolean({
      description: 'Advisory mode: always exit with code 0 regardless of findings (do not block)',
      default: false,
    }),
  }

  public async run(): Promise<ReleaseGuardReport> {
    const {flags} = await this.parse(Assess)
    const host = getAgentiaHost({requires: [...REQUIRED]})
    const findings: Finding[] = []

    // 1. Run all checks in parallel with error isolation
    const [
      orgHealthResult,
      topologyResult,
      promotionsResult,
      jobsResult,
      workspaceResult,
      hygieneResult,
    ] = await Promise.all([
      evaluateOrganizationHealth(host),
      evaluatePipelineTopology(host),
      evaluatePromotionsAndValidations(host),
      evaluateJobsAndApexTests(host),
      evaluateWorkspaceAndGitConflicts(host),
      evaluateCodeAndMetadataHygiene(),
    ])

    // Aggregate findings
    findings.push(...orgHealthResult.findings)
    findings.push(...topologyResult.findings)
    findings.push(...promotionsResult.findings)
    findings.push(...jobsResult.findings)
    findings.push(...workspaceResult.findings)
    findings.push(...hygieneResult.findings)

    // Separate authentication findings from pipeline topology for clean category accounting
    const authFindings = topologyResult.findings.filter(f => f.category === 'Authentication')
    const pipelineFindings = topologyResult.findings.filter(f => f.category === 'Pipeline & Topology')

    // Define category evaluation breakdown
    const categoryConfigs: {
      category: CheckCategory
      findings: Finding[]
      passCount: number
    }[] = [
      {
        category: 'Governance',
        findings: orgHealthResult.findings,
        passCount: orgHealthResult.passCount,
      },
      {
        category: 'Pipeline & Topology',
        findings: pipelineFindings,
        passCount: topologyResult.passCount,
      },
      {
        category: 'Authentication',
        findings: authFindings,
        passCount: Object.values(topologyResult.authStatus).filter(c => c.configured && c.ready === true).length,
      },
      {
        category: 'Promotions & Validations',
        findings: promotionsResult.findings,
        passCount: promotionsResult.passCount,
      },
      {
        category: 'Quality & Test Coverage',
        findings: jobsResult.findings,
        passCount: jobsResult.passCount,
      },
      {
        category: 'Workspace & Git Conflicts',
        findings: workspaceResult.findings,
        passCount: workspaceResult.passCount,
      },
      {
        category: 'Code & Lint Hygiene',
        findings: hygieneResult.findings,
        passCount: hygieneResult.passCount,
      },
    ]

    const categories: CategorySummary[] = categoryConfigs.map(c => {
      const failCount = c.findings.filter(f => f.severity === 'FAIL').length
      const warnCount = c.findings.filter(f => f.severity === 'WARN').length
      const unknownCount = c.findings.filter(f => f.severity === 'UNKNOWN').length

      let status: Severity = 'PASS'
      if (failCount > 0) status = 'FAIL'
      else if (warnCount > 0) status = 'WARN'
      else if (unknownCount > 0) status = 'UNKNOWN'

      const totalCount = c.passCount + failCount + warnCount + unknownCount

      return {
        category: c.category,
        status,
        passCount: c.passCount,
        warnCount,
        failCount,
        unknownCount,
        totalCount,
      }
    })

    // Calculate total individual checks evaluated across all suites
    const totalPassed = categories.reduce((acc, cat) => acc + cat.passCount, 0)
    const totalWarnings = findings.filter(f => f.severity === 'WARN').length
    const totalFailures = findings.filter(f => f.severity === 'FAIL').length
    const totalUnknowns = findings.filter(f => f.severity === 'UNKNOWN').length
    const totalChecks = totalPassed + totalWarnings + totalFailures + totalUnknowns

    // Determine overall assessment status
    const overall = totalFailures > 0
      ? 'FAIL'
      : totalWarnings > 0
        ? 'REVIEW'
        : totalUnknowns > 0
          ? 'INCOMPLETE'
          : 'PASS'

    // Optional AI Advisor analysis
    let aiAdvice = null
    if (flags.ai) {
      aiAdvice = await askReleaseAdvisor(host, findings, overall)
    }

    const report: ReleaseGuardReport = {
      product: 'ReleaseGuard',
      version: '0.2.0',
      assessment: 'Unified Salesforce Pre-Flight Release Readiness Assessment',
      timestamp: new Date().toISOString(),
      overall,
      counts: {
        passed: totalPassed,
        warnings: totalWarnings,
        failures: totalFailures,
        unknowns: totalUnknowns,
        total: totalChecks,
      },
      categories,
      inventory: {
        healthChecks: orgHealthResult.summary,
        pipelines: topologyResult.pipelinesCount,
        promotions: promotionsResult.promotionsCount,
        environments: topologyResult.environmentsCount,
        jobs: jobsResult.jobsCount,
        activeStory: workspaceResult.activeStory,
        branch: workspaceResult.branch,
        baseBranch: workspaceResult.baseBranch,
      },
      authentication: topologyResult.authStatus,
      findings,
      aiAdvice: aiAdvice ?? undefined,
      limitations: [
        'The assessment inspects only data accessible through configured Agentia credentials and local repository context.',
        'A PASS assessment verifies pre-flight release readiness but does not guarantee target org deployment success.',
        'This command is strictly read-only and does not commit, promote, or deploy changes.',
      ],
    }

    // Render formatted terminal display
    this.display(() => {
      this.log('')
      this.log('========================================================================')
      this.log('  ReleaseGuard — Pre-Flight Release Readiness Cockpit')
      this.log('========================================================================')
      this.log(`  Overall Status:  ${this.formatBadge(overall)}`)
      this.log(`  Total Checks:    ${report.counts.total} (${report.counts.passed} Passed, ${report.counts.warnings} Warnings, ${report.counts.failures} Failures, ${report.counts.unknowns} Incomplete)`)
      this.log(`  Active Story:    ${report.inventory.activeStory ?? 'None linked'}`)
      this.log(`  Active Branch:   ${report.inventory.branch ?? 'Not detected'} ${report.inventory.baseBranch ? `(Base: ${report.inventory.baseBranch})` : ''}`)
      this.log(`  Inventory:       ${report.inventory.pipelines ?? 0} Pipelines | ${report.inventory.promotions ?? 0} Promotions | ${report.inventory.environments ?? 0} Environments | ${report.inventory.jobs ?? 0} Jobs`)
      this.log('------------------------------------------------------------------------')

      // Category Summary Table
      this.log('\nCategory Assessment Summary:')
      this.log(
        host.format.table(
          [
            {field: 'status', header: 'Status'},
            {field: 'category', header: 'Check Category'},
            {field: 'passed', header: 'Passed Checks'},
            {field: 'issues', header: 'Issues Detected'},
          ],
          categories.map(c => ({
            status: this.formatBadge(c.status),
            category: c.category,
            passed: `${c.passCount} / ${c.totalCount}`,
            issues: c.failCount > 0
              ? `${c.failCount} Failure(s)`
              : c.warnCount > 0
                ? `${c.warnCount} Warning(s)`
                : c.unknownCount > 0
                  ? `${c.unknownCount} Incomplete`
                  : 'All clear',
          })),
        ),
      )

      // Detailed Findings Table
      if (findings.length > 0) {
        this.log('\nActionable Findings & Recommendations:')
        this.log(
          host.format.table(
            [
              {field: 'severity', header: 'Severity'},
              {field: 'category', header: 'Category'},
              {field: 'check', header: 'Check', wrap: true},
              {field: 'evidence', header: 'Evidence', wrap: true},
              {field: 'recommendation', header: 'Recommended Next Step', wrap: true},
            ],
            findings.map(f => ({
              severity: this.formatBadge(f.severity),
              category: f.category,
              check: f.check,
              evidence: f.evidence,
              recommendation: f.recommendation,
            })),
          ),
        )
      } else {
        this.log('\n[PASS] No blocking findings or warnings detected across all check suites.')
      }

      // AI Advice Display
      if (aiAdvice) {
        this.log('\n========================================================================')
        this.log(`  Copado Agentia AI Release Advisor  [Risk Level: ${aiAdvice.riskLevel}]`)
        this.log('========================================================================')
        this.log(`\n${aiAdvice.summary}\n`)
        if (aiAdvice.recommendations.length > 0) {
          this.log('Recommended Action Plan:')
          for (const [index, rec] of aiAdvice.recommendations.entries()) {
            this.log(`  ${index + 1}. ${rec}`)
          }
        }
      } else if (!flags.ai && (overall === 'FAIL' || overall === 'REVIEW')) {
        this.log('\nTip: Add `--ai` (`agentia releaseguard assess --ai`) to generate an automated remediation plan using Copado AI.')
      }

      this.log('\nNote: Read-only assessment. No metadata, deployment, or promotion was modified.\n')
    })

    // Quality Gate Exit Code Policy
    // Default: FAIL blocks (exit code 1); WARN/UNKNOWN are advisory (exit code 0)
    // --strict: Elevates WARN and UNKNOWN to block (exit code 1)
    // --advisory: Never blocks (exit code 0)
    if (!flags.advisory) {
      if (overall === 'FAIL') {
        process.exitCode = 1
      } else if (flags.strict && (overall === 'REVIEW' || overall === 'INCOMPLETE')) {
        process.exitCode = 1
      }
    }

    return report
  }

  private formatBadge(status: string): string {
    switch (status) {
      case 'PASS':
        return '[PASS]'
      case 'WARN':
      case 'REVIEW':
        return '[WARN]'
      case 'FAIL':
        return '[FAIL]'
      case 'UNKNOWN':
      case 'INCOMPLETE':
        return '[UNKNOWN]'
      default:
        return `[${status}]`
    }
  }
}
