import * as core from '@actions/core'
import {
  syncJiraWithClosedDependabotPulls,
  syncJiraWithOpenDependabotAlerts
} from './actions'

async function run(): Promise<void> {
  try {
    core.setOutput(
      'Start dependabot jira issue creation',
      new Date().toTimeString()
    )
    const label: string = core.getInput('jiraIssueLabel')
    const projectKey: string = core.getInput('jiraProjectKey')
    const issueType: string = core.getInput('jiraIssueType')
    const repo: string = core.getInput('githubRepo')
    const owner: string = core.getInput('githubOwner')
    const closeIssueOnMerge: string = core.getInput('closeIssueOnMerge')

    // First close jira issue that are closed in github
    if (closeIssueOnMerge === 'true') {
      await syncJiraWithClosedDependabotPulls({
        repo,
        owner,
        label,
        projectKey,
        issueType,
        closeIssueOnMerge
      })
    }

    // Then open new issues in jira from open dependabot issues
    await syncJiraWithOpenDependabotAlerts({
      repo,
      owner,
      label,
      projectKey,
      issueType
    })
  } catch (error) {
    if (error instanceof Error) {
      core.debug(error.message)
      core.setFailed(error.message)
    }
  }
}

run()
