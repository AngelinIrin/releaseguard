import type {AgentiaPluginHost} from '@copado/agentia-plugin-sdk'
import type {Finding} from '../types.js'

export async function evaluatePipelineTopology(
  host: AgentiaPluginHost,
): Promise<{
  findings: Finding[]
  passCount: number
  pipelinesCount: number | null
  environmentsCount: number | null
  authStatus: Record<string, {configured?: boolean; ready?: boolean; source?: string}>
}> {
  const findings: Finding[] = []
  let passCount = 0

  // 1. Authentication Status
  let authStatus: Record<string, {configured?: boolean; ready?: boolean; source?: string}> = {}
  try {
    authStatus = host.auth.status()
    for (const [service, credential] of Object.entries(authStatus)) {
      if (!credential.configured) {
        findings.push({
          severity: 'WARN',
          category: 'Authentication',
          check: `${service} credentials`,
          evidence: 'No credential set is configured.',
          recommendation: `Configure ${service} credentials if this release workflow requires them.`,
        })
      } else if (credential.ready === false) {
        findings.push({
          severity: 'FAIL',
          category: 'Authentication',
          check: `${service} credentials`,
          evidence: 'The credential set is configured but not ready.',
          recommendation: `Resolve the ${service} authentication issue before relying on this service.`,
        })
      } else if (credential.ready === undefined) {
        findings.push({
          severity: 'UNKNOWN',
          category: 'Authentication',
          check: `${service} credentials`,
          evidence:
            'Credentials are configured, but the SDK does not report whether they are ready.',
          recommendation:
            'Verify connectivity with a supported, non-destructive operation before relying on this service.',
        })
      } else {
        passCount++
      }
    }
  } catch (err) {
    findings.push({
      severity: 'UNKNOWN',
      category: 'Authentication',
      check: 'Agentia auth status',
      evidence: `Could not determine auth status: ${err instanceof Error ? err.message : String(err)}`,
      recommendation: 'Verify Agentia CLI authentication setup.',
    })
  }

  // 2. Environments List
  let environmentsCount: number | null = null
  try {
    const environments = await host.environment.list({pageSize: 200})
    environmentsCount = environments?.length ?? 0
    if (environmentsCount === 0) {
      findings.push({
        severity: 'WARN',
        category: 'Pipeline & Topology',
        check: 'Environment inventory',
        evidence: 'No environments were returned by Copado.',
        recommendation: 'Confirm environment setup and permissions in your Copado org.',
      })
    } else {
      passCount++
    }
  } catch (err) {
    findings.push({
      severity: 'UNKNOWN',
      category: 'Pipeline & Topology',
      check: 'Environments inventory',
      evidence: `The SDK could not retrieve environment details: ${err instanceof Error ? err.message : String(err)}`,
      recommendation: 'Check Copado environment access permissions and rerun the assessment.',
    })
  }

  // 3. Pipelines List & Deep Connection Inspection
  let pipelinesCount: number | null = null
  try {
    const pipelines = await host.pipeline.list({pageSize: 200})
    pipelinesCount = pipelines?.length ?? 0

    if (pipelinesCount === 0) {
      findings.push({
        severity: 'WARN',
        category: 'Pipeline & Topology',
        check: 'Pipeline inventory',
        evidence: 'No pipelines were returned by the SDK.',
        recommendation:
          'Confirm the correct Copado project, permissions, and pipeline configuration.',
      })
    } else {
      for (const pipeline of pipelines) {
        let pipelineHealthy = true

        if (pipeline.active === false) {
          pipelineHealthy = false
          findings.push({
            severity: 'WARN',
            category: 'Pipeline & Topology',
            check: `Pipeline: ${pipeline.name ?? pipeline.id}`,
            evidence: 'The pipeline is marked inactive.',
            recommendation: 'Confirm whether this pipeline should be active.',
          })
        }

        try {
          const details = await host.pipeline.get(pipeline.id)
          const connections = details.connections ?? []
          const label = details.name ?? details.id

          if (connections.length === 0) {
            pipelineHealthy = false
            findings.push({
              severity: 'UNKNOWN',
              category: 'Pipeline & Topology',
              check: `Pipeline connections: ${label}`,
              evidence: 'The SDK returned no environment connection details.',
              recommendation:
                'Verify pipeline connections in Copado or investigate the available SDK data.',
            })
            continue
          }

          const incompleteConnections = connections.filter(
            connection =>
              !connection.sourceEnvironment?.id ||
              !connection.destinationEnvironment?.id ||
              !connection.branch,
          )

          if (incompleteConnections.length > 0) {
            pipelineHealthy = false
            findings.push({
              severity: 'UNKNOWN',
              category: 'Pipeline & Topology',
              check: `Pipeline connections: ${label}`,
              evidence: `${incompleteConnections.length} of ${connections.length} connections have incomplete source, destination, or branch details.`,
              recommendation:
                'Review the incomplete connections in Copado before relying on this assessment.',
            })
          }
        } catch {
          pipelineHealthy = false
          findings.push({
            severity: 'UNKNOWN',
            category: 'Pipeline & Topology',
            check: `Pipeline connections: ${pipeline.name ?? pipeline.id}`,
            evidence: 'The SDK could not retrieve individual pipeline details.',
            recommendation: 'Verify pipeline details in Copado and retry the assessment.',
          })
        }

        if (pipelineHealthy) {
          passCount++
        }
      }
    }
  } catch (err) {
    findings.push({
      severity: 'UNKNOWN',
      category: 'Pipeline & Topology',
      check: 'Pipelines inventory',
      evidence: `The SDK could not retrieve pipeline information: ${err instanceof Error ? err.message : String(err)}`,
      recommendation: 'Check Copado pipeline permissions and rerun the assessment.',
    })
  }

  return {findings, passCount, pipelinesCount, environmentsCount, authStatus}
}
