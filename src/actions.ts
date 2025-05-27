import {
  getDependabotOpenAlerts,
  getPullRequestByIssueId,
  DependabotAlert
} from './github'
import {closeJiraIssue, createJiraIssue, jiraApiSearch} from './jira'
import * as core from '@actions/core'

export interface SyncJiraOpen {
  repo: string
  owner: string
  label: string
  projectKey: string
  issueType: string
  transitionDoneName?: string
  closeIssueOnMerge?: string
}

export function extractIssueNumber(description: string): string {
  const issueNumberRegex = /PULL_NUMBER_(.*)_PULL_NUMBER/g
  const parts = issueNumberRegex.exec(description)
  if (parts && parts.length > 1) {
    return parts[1]
  } else {
    return '-1'
  }
}

export function createIssueNumberString(
  pullNumber: string,
  stringType: string
): string {
  return `${stringType}_NUMBER_${pullNumber}_${stringType}_NUMBER`
}

export async function syncJiraWithOpenDependabotPulls(
  params: SyncJiraOpen
): Promise<string> {
  try {
    core.setOutput(
      'Sync jira with open dependabot pulls starting',
      new Date().toTimeString()
    )
    const {repo, owner, label, projectKey, issueType} = params
    const dependabotPulls: DependabotAlert[] = await getDependabotOpenAlerts({
      repo,
      owner
    })
    for (const pull of dependabotPulls) {
      await createJiraIssue({
        label,
        projectKey,
        issueType,
        stringType: 'ALERT',
        ...pull
      })
    }
    core.setOutput(
      'Sync jira with open dependabot alerts success',
      new Date().toTimeString()
    )
    return 'success'
  } catch (e) {
    throw e
  }
}

export async function syncJiraWithClosedDependabotPulls(
  params: SyncJiraOpen
): Promise<string> {
  try {
    core.setOutput(
      'Sync jira with closed dependabot pulls starting',
      new Date().toTimeString()
    )
    const {
      repo,
      owner,
      label,
      projectKey,
      issueType,
      transitionDoneName,
      closeIssueOnMerge
    } = params

    // First find all issues in jira that are not done
    const jql = `labels="${label}" AND project=${projectKey} AND issuetype=${issueType} AND status != Done`
    const existingIssuesResponse = await jiraApiSearch({
      jql
    })

    if (
      existingIssuesResponse &&
      existingIssuesResponse.issues &&
      existingIssuesResponse.issues.length > 0 &&
      closeIssueOnMerge &&
      closeIssueOnMerge === 'true'
    ) {
      // Loop through issue that are not done and check if they are done in github
      for (const issue of existingIssuesResponse.issues) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const issueNumber = extractIssueNumber(issue.fields.description)
        const pullRequest = await getPullRequestByIssueId({
          repo,
          owner,
          issueNumber
        })
        if (pullRequest.state === 'closed') {
          // If the github issue is closed then close the jira issue
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          await closeJiraIssue(issue.id, transitionDoneName)
        }
      }
    }

    core.setOutput(
      'Sync jira with closed dependabot pulls success',
      new Date().toTimeString()
    )
    return 'success'
  } catch (e) {
    core.debug(`ERROR ${JSON.stringify(e)}`)
    throw e
  }
}
