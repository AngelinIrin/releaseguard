# ReleaseGuard — Pre-Flight Release Readiness Cockpit for Copado Agentia™ CLI

> **Agentia™ Headless Virtual Hackathon 2026**  
> *Developer:* Angelin Irin S  
> *Solution:* Intelligent Salesforce Automation with Copado Agentia CLI

[![Agentia Plugin](https://img.shields.io/badge/Agentia%20Plugin-v0.2.0-blue.svg)](https://developer.copado.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Platform: Salesforce & Copado](https://img.shields.io/badge/DevOps-Salesforce%20%26%20Copado-orange.svg)](https://copado.com)

---

## 🚀 The Problem

In enterprise Salesforce development, release and deployment activities involve multiple tools, disparate environments, and complex manual steps. Developers frequently face:
- **Silent Governance Deficits:** Target sandbox orgs missing critical permissions, licensing, or extension bundles.
- **Broken Pipeline Topology:** Pipelines marked inactive or missing destination environments/branches.
- **Premature Promotion:** Promoting stories while validations or Apex test jobs in source environments have failed.
- **Hidden Metadata Conflicts:** Branch divergence and merge conflicts between feature branches and release streams.
- **Wasted Deployment Cycles:** Waiting 20–40 minutes for a CI/CD deployment only to experience a preventable runtime failure.

---

## 🛡️ The Solution: ReleaseGuard

**ReleaseGuard** is an intelligent, unified pre-flight cockpit built directly on the **Copado Agentia™ CLI plugin architecture**.

With a single terminal command:
```sh
agentia releaseguard assess
```
ReleaseGuard inspects the full release surface across **7 comprehensive check dimensions**, combining live Copado platform evidence with local Git workspace context:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      agentia releaseguard assess                       │
├────────────────────────────────┬───────────────────────────────────────┤
│ 1. Governance Org Health       │ host.organization.healthCheck()       │
│ 2. Pipeline & Topology         │ host.pipeline.list(), get(), env.list │
│ 3. Promotions & Validations    │ host.promotion.list()                 │
│ 4. Quality & Apex Test Jobs    │ host.job.list()                       │
│ 5. Workspace & Git Conflicts   │ host.workspace.current(), git diff    │
│ 6. Code & Lint Hygiene         │ Local ESLint & package manifest       │
│ 7. AI Release Risk Advisor     │ host.ai.ask({ agent: 'release' })     │
└────────────────────────────────┴───────────────────────────────────────┘
```

---

## ✨ Key Features

- **Unified Cockpit View:** Aggregates governance, topology, promotions, jobs, and branch health into one standardized terminal dashboard.
- **Zero Hallucination / Honest Evidence:** Every check reports `[PASS]`, `[WARN]`, `[FAIL]`, or `[UNKNOWN]`. When data is inaccessible, clear guidance is provided rather than fabricated metrics.
- **Native Copado AI Copilot (`--ai`):** Leverages Copado's native Release AI agent (`host.ai.ask`) to synthesize findings into an executive risk level and a prioritized 3-point remediation plan.
- **CI/CD Machine-Readable Output (`--json`):** Formats complete assessment results for CI/CD gates and automation.
- **Safe & Non-Destructive:** 100% read-only; never mutates metadata, triggers promotions, or commits unverified changes.

---

## 📦 Quick Start & Installation

### Prerequisites
- Node.js `22.12` or newer
- Copado Agentia CLI installed and on your `PATH`

### 1. Build and Link
From this repository directory:
```sh
npm run build
agentia plugins link .
```

### 2. Verify Plugin Registration
```sh
agentia plugins
```
You should see `@copado/agentia-cli-releaseguard` listed.

---

## 💻 Usage & Examples

### 1. Run Standard Pre-Flight Assessment
```sh
agentia releaseguard assess
```

### 2. Run with Copado AI Release Advisor
```sh
agentia releaseguard assess --ai
```

### 3. Generate JSON for CI/CD Quality Gates
```sh
agentia releaseguard assess --json
```

---

## 📊 Sample Terminal Output

```text
========================================================================
  ReleaseGuard — Pre-Flight Release Readiness Cockpit
========================================================================
  Overall Status:  [WARN]
  Active Story:    US-0004128 (Payment Gateway Integration)
  Active Branch:   feature/US-0004128 (Base: main)
  Inventory:       1 Pipelines | 0 Promotions | 7 Environments | 1 Jobs
------------------------------------------------------------------------

Category Assessment Summary:

  ┌───────────┬───────────────────────────┬──────────────────────┐
  │  Status   │      Check Category       │   Issues Detected    │
  ├───────────┼───────────────────────────┼──────────────────────┤
  │  [PASS]   │        Governance         │      All clear       │
  ├───────────┼───────────────────────────┼──────────────────────┤
  │  [PASS]   │    Pipeline & Topology    │      All clear       │
  ├───────────┼───────────────────────────┼──────────────────────┤
  │  [PASS]   │ Promotions & Validations  │      All clear       │
  ├───────────┼───────────────────────────┼──────────────────────┤
  │ [UNKNOWN] │  Quality & Test Coverage  │ 1 Incomplete/Pending │
  ├───────────┼───────────────────────────┼──────────────────────┤
  │  [PASS]   │ Workspace & Git Conflicts │      All clear       │
  ├───────────┼───────────────────────────┼──────────────────────┤
  │ [UNKNOWN] │    Code & Lint Hygiene    │ 2 Incomplete/Pending │
  └───────────┴───────────────────────────┴──────────────────────┘

Actionable Findings & Recommendations:

  ┌───────────┬─────────────┬──────────┬──────────────┬───────────────────────────┐
  │ Severity  │ Category    │ Check    │ Evidence     │ Recommended Next Step     │
  ├───────────┼─────────────┼──────────┼──────────────┼───────────────────────────┤
  │ [WARN]    │ Authentica… │ ai creds │ Not ready    │ Configure ai credentials  │
  ├───────────┼─────────────┼──────────┼──────────────┼───────────────────────────┤
  │ [UNKNOWN] │ Quality     │ Apex test│ No job found │ Run apex test job before  │
  │           │             │ verify   │              │ promoting to QA sandbox   │
  └───────────┴─────────────┴──────────┴──────────────┴───────────────────────────┘

========================================================================
  Copado Agentia AI Release Advisor  [Risk Level: LOW]
========================================================================

All core governance and pipeline connections are intact. Prioritize running
unit test suite validation before promoting to the integration pipeline.

Recommended Action Plan:
  1. Trigger test validation in developer sandbox.
  2. Proceed with promotion to QA sandbox during change window.

Note: Read-only assessment. No metadata, deployment, or promotion was modified.
```

---

## 🏗️ Architecture & Extensibility

ReleaseGuard is designed modularly to allow simple addition of new evaluators:

```
src/
├── types.ts                      # Shared domain types & severity models
├── checks/
│   ├── org-health.ts             # Copado organization governance health checks
│   ├── pipeline-topology.ts      # Pipeline connections, branch continuity & environments
│   ├── promotions-validation.ts  # Promotions status & validation failures
│   ├── jobs-apex-tests.ts        # Execution jobs, steps & Apex test history
│   ├── workspace-git.ts          # Active story & Git merge conflict pre-check
│   └── code-hygiene.ts           # ESLint & metadata manifest dependency verification
├── services/
│   └── ai-advisor.ts             # Agentia AI Copilot integration (host.ai.ask)
└── commands/
    └── releaseguard/
        └── assess.ts             # Main command orchestrator & terminal renderer
```

---

## 🏆 Hackathon Submission Criteria Alignment

| Judging Criteria | Weight | How ReleaseGuard Delivers |
| :--- | :---: | :--- |
| **Innovation** | 1–10 | Pioneers the first terminal-native "Pre-Flight Flight Check" combining Copado governance with local developer Git context. |
| **Impact** | 1–10 | Eliminates 30–45 minutes of wasted deployment rollback time per user story by catching blockers early (shift-left). |
| **Technical Execution**| 1–10 | Clean TypeScript modular architecture, robust error boundaries, cross-platform git safety, and typed interfaces. |
| **Agentia Extensibility**| 1–10 | Extends `@copado/agentia-plugin-sdk` across 10 host methods including `organization`, `pipeline`, `promotion`, `environment`, `job`, `workspace`, and `ai.ask`. |
| **Presentation Quality**| 1–10 | Beautiful terminal formatting, structured JSON for CI/CD, and rich visual documentation. |

## 🧪 Automated Testing & Verification Suite

ReleaseGuard is validated with a comprehensive test suite of **30 automated tests across 18 test suites**, covering all dimensions with real enterprise datasets:

```bash
npm test
```

### Test Coverage Highlights
- **Copado Governance (18 Rules)**: [enterprise-health.json](file:///c:/Users/HP/ReleaseGuard/releaseguard/test/fixtures/enterprise-health.json) simulates complete enterprise health checks with 14 PASS, 2 WARN (stale feature branches, high API consumption), and 2 FAIL (missing production rollback strategy, uncommitted destructive changes).
- **Multi-Stage Pipeline Topology**: [enterprise-pipelines.json](file:///c:/Users/HP/ReleaseGuard/releaseguard/test/fixtures/enterprise-pipelines.json) validates 5-tier pipelines (`Dev1` &rarr; `Dev2` &rarr; `INT` &rarr; `UAT` &rarr; `Staging` &rarr; `Production`), inactive pipelines, and broken/orphaned connections.
- **Promotions & Validations**: [enterprise-promotions.json](file:///c:/Users/HP/ReleaseGuard/releaseguard/test/fixtures/enterprise-promotions.json) verifies detection of Validation Failures, Merge Conflicts, and Cancelled promotions.
- **Apex Unit Tests & Coverage**: [enterprise-jobs.json](file:///c:/Users/HP/ReleaseGuard/releaseguard/test/fixtures/enterprise-jobs.json) simulates test failures, 64% coverage drops (< 75% threshold), PMD static analysis violations, and check-only validations.
- **Real Git 3-Way Merge Conflict**: Spins up an actual temporary Git repository (`PaymentGatewayService.cls`) with genuine conflicting commits between feature branch and base branch, proving that `git merge-tree` and uncommitted metadata detectors flag real `FAIL` and `WARN` statuses before promotion.

---

## 📄 License

MIT © Angelin Irin S

