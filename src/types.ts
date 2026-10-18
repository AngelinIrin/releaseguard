export type Severity = 'PASS' | 'WARN' | 'FAIL' | 'UNKNOWN'

export type CheckCategory =
  | 'Governance'
  | 'Pipeline & Topology'
  | 'Promotions & Validations'
  | 'Quality & Test Coverage'
  | 'Workspace & Git Conflicts'
  | 'Code & Lint Hygiene'
  | 'Authentication'

export type Finding = {
  severity: Severity
  category: CheckCategory
  check: string
  evidence: string
  recommendation: string
}

export type CategorySummary = {
  category: CheckCategory
  status: Severity
  passCount: number
  warnCount: number
  failCount: number
  unknownCount: number
  totalCount: number
}

export type InventorySummary = {
  healthChecks: {
    total: number
    pass: number
    warn: number
    fail: number
  } | null
  pipelines: number | null
  promotions: number | null
  environments: number | null
  jobs?: number | null
  activeStory?: string | null
  branch?: string | null
  baseBranch?: string | null
}

export type ReleaseGuardReport = {
  product: 'ReleaseGuard'
  version: string
  assessment: string
  timestamp: string
  overall: 'PASS' | 'REVIEW' | 'FAIL' | 'INCOMPLETE'
  counts: {
    passed: number
    warnings: number
    failures: number
    unknowns: number
    total: number
  }
  categories: CategorySummary[]
  inventory: InventorySummary
  authentication: Record<string, {configured?: boolean; ready?: boolean; source?: string}>
  findings: Finding[]
  aiAdvice?: {
    summary: string
    recommendations: string[]
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  }
  limitations: string[]
}
