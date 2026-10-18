import {execSync} from 'node:child_process'
import type {AgentiaPluginHost} from '@copado/agentia-plugin-sdk'
import type {Finding} from '../types.js'

export async function evaluateWorkspaceAndGitConflicts(
  host: AgentiaPluginHost,
  options?: {cwd?: string},
): Promise<{
  findings: Finding[]
  passCount: number
  activeStory: string | null
  branch: string | null
  baseBranch: string | null
}> {
  const findings: Finding[] = []
  let activeStory: string | null = null
  let branch: string | null = null
  let baseBranch: string | null = null
  let passCount = 0

  try {
    const ws = await host.workspace.current()
    if (ws) {
      activeStory = ws.workItemName ?? ws.workItemTitle ?? null
      branch = ws.branch ?? null
      baseBranch = ws.baseBranch ?? null
      if (activeStory) {
        passCount++
      }
    }
  } catch (err) {
    findings.push({
      severity: 'UNKNOWN',
      category: 'Workspace & Git Conflicts',
      check: 'Copado workspace context',
      evidence: `Could not determine active workspace context: ${err instanceof Error ? err.message : String(err)}`,
      recommendation:
        'Select a Copado work item with `agentia cicd work select` to link your local branch to a release story.',
    })
  }

  // Inspect local Git state safely and non-destructively
  try {
    // 1. Check current git branch if not provided by workspace
    if (!branch) {
      const gitBranchOut = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: options?.cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 3000,
      }).trim()
      if (gitBranchOut) {
        branch = gitBranchOut
      }
    }

    // 2. Check for dirty working tree / uncommitted metadata
    const statusOut = execSync('git status --porcelain', {
      cwd: options?.cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    }).trim()

    if (statusOut) {
      const changedFilesCount = statusOut.split('\n').filter(Boolean).length
      findings.push({
        severity: 'WARN',
        category: 'Workspace & Git Conflicts',
        check: 'Uncommitted metadata changes',
        evidence: `Working tree has ${changedFilesCount} uncommitted or untracked changes.`,
        recommendation:
          'Commit or stash changes before promoting to avoid releasing incomplete metadata or experiencing branch discrepancies.',
      })
    } else {
      passCount++
    }

    // 3. Conflict Detection against base branch
    if (baseBranch && branch && baseBranch !== branch) {
      try {
        const refsToCompare = [baseBranch, `origin/${baseBranch}`]
        let checkedAny = false
        let foundConflict = false

        for (const ref of refsToCompare) {
          try {
            const mergeBase = execSync(`git merge-base HEAD ${ref}`, {
              cwd: options?.cwd,
              encoding: 'utf8',
              stdio: ['ignore', 'pipe', 'ignore'],
              timeout: 4000,
            }).trim()

            if (mergeBase) {
              checkedAny = true
              const mergeTree = execSync(`git merge-tree ${mergeBase} HEAD ${ref}`, {
                cwd: options?.cwd,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
                timeout: 5000,
              })

              if (mergeTree.includes('<<<<<<<') || mergeTree.includes('changed in both')) {
                foundConflict = true
                findings.push({
                  severity: 'FAIL',
                  category: 'Workspace & Git Conflicts',
                  check: `Metadata merge conflict with ${baseBranch}`,
                  evidence: `Branch '${branch}' has conflicting metadata changes with target base branch '${baseBranch}'.`,
                  recommendation:
                    `Pull and merge '${baseBranch}' into '${branch}' locally and resolve merge conflicts before promoting in Copado.`,
                })
                break
              }
            }
          } catch {
            // Ref might not exist (e.g. no remote or no local checkout), continue
          }
        }

        if (checkedAny && !foundConflict) {
          passCount++
        } else if (!checkedAny) {
          findings.push({
            severity: 'UNKNOWN',
            category: 'Workspace & Git Conflicts',
            check: `Base branch comparison: ${baseBranch}`,
            evidence: `Could not compare branch against '${baseBranch}' (remote branch may need fetching).`,
            recommendation: `Run 'git fetch origin ${baseBranch}' to enable automated conflict pre-checks.`,
          })
        }
      } catch {
        findings.push({
          severity: 'UNKNOWN',
          category: 'Workspace & Git Conflicts',
          check: `Base branch comparison: ${baseBranch}`,
          evidence: `Could not compare branch against '${baseBranch}' (remote branch may need fetching).`,
          recommendation: `Run 'git fetch origin ${baseBranch}' to enable automated conflict pre-checks.`,
        })
      }
    }
  } catch {
    findings.push({
      severity: 'UNKNOWN',
      category: 'Workspace & Git Conflicts',
      check: 'Local Git repository status',
      evidence: 'Local directory does not appear to be an active Git repository or Git is unavailable.',
      recommendation:
        'Run this command from inside your project repository root for branch and conflict detection.',
    })
  }

  return {findings, passCount, activeStory, branch, baseBranch}
}
