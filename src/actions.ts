import {
  DependabotAlert,
  getDependabotOpenAlerts,
  getDependabotOpenPullRequests,
  getPullRequestByIssueId,
  PullRequest
} from './github'
import {
  closeJiraIssue,
  createJiraIssue,
  jiraApiSearch,
  getConfluenceDocument,
  createJiraIssueFromAlerts
} from './jira'
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

export function createIssuePullNumberString(pullNumber: string): string {
  return `PULL_NUMBER_${pullNumber}_PULL_NUMBER`
}

export function createIssueAlertNumberString(pullNumber: string): string {
  return `ALERT_NUMBER_${pullNumber}_ALERT_NUMBER`
}

export function getTableContent(html: string, offset = 0): string {
  const start = html.indexOf('<tbody>') + 7
  const end = html.indexOf('</tbody>')

  core.debug(offset.toString())

  const tableContent = html.substring(start, end - start)

  return tableContent
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
    const dependabotPulls: PullRequest[] = await getDependabotOpenPullRequests({
      repo,
      owner
    })
    const jiraTickets = []
    let projectStatus = 'none'

    for (const pull of dependabotPulls) {
      const jiraTicketData = await createJiraIssue({
        label,
        projectKey,
        issueType,
        ...pull
      })

      if (pull.alerts && pull.alerts.length > 0) {
        projectStatus = 'security'
      }

      jiraTickets.push({
        jiraTicketData,
        label,
        projectKey,
        issueType,
        ...pull
      })
    }

    // Update confluence.
    // Projects & Hosting Documents
    if (
      process.env.CONFLUENCE_PROJECTS_DOC_ID &&
      process.env.CONFLUENCE_PROJECTS_DOC_ID !== ''
    ) {
      const projectDocId = process.env.CONFLUENCE_PROJECTS_DOC_ID
      const confluenceData = getConfluenceDocument({pageId: projectDocId})
      // const statusTagMarkup = getMarkupForStatusTags(projectStatus)

      core.debug(projectStatus)
      core.debug(JSON.stringify(confluenceData))
    }

    let projectPageId = core.getInput('jiraProjectPage')
    if (projectPageId && projectPageId !== '') {
      projectPageId = projectPageId.replace(
        'https://interactiveknowledge.atlassian.net/wiki/spaces/kb/pages/',
        ''
      )
      projectPageId = projectPageId.substring(0, projectPageId.indexOf('/'))

      const confluenceData = getConfluenceDocument({pageId: projectPageId})
      // const statusTagMarkup = getMarkupForStatusTags(projectStatus)

      core.debug(projectPageId)
      core.debug(JSON.stringify(confluenceData))
    }

    core.setOutput(
      'Sync jira with open dependabot pulls success',
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

export async function syncJiraWithOpenDependabotAlerts(
  params: SyncJiraOpen
): Promise<string> {
  try {
    core.setOutput(
      'Sync jira with open dependabot pulls starting',
      new Date().toTimeString()
    )
    const {repo, owner, label, projectKey, issueType} = params
    const dependabotAlerts: DependabotAlert[] = await getDependabotOpenAlerts({
      repo,
      owner
    })
    const jiraTickets = []
    let projectStatus = 'none'

    for (const alert of dependabotAlerts) {
      const issueSummary = `Dependabot ${alert.severity.toUpperCase()} alert: ${
        alert.summary
      }`
      const jiraTicketData = await createJiraIssueFromAlerts({
        ...alert,
        label,
        projectKey,
        issueSummary,
        issueType,
        repoName: repo,
        repoUrl: `https://github.com/${owner}/${repo}`
      })

      projectStatus = 'security'

      jiraTickets.push({
        ...alert,
        jiraIssue: jiraTicketData.data
      })
    }

    core.debug(projectStatus)
    core.debug(JSON.stringify(jiraTickets))
    // const statusTagMarkup = getMarkupForStatusTags(projectStatus)

    // Update confluence.
    // Projects & Hosting Documents
    if (
      process.env.CONFLUENCE_PROJECTS_DOC_ID &&
      process.env.CONFLUENCE_PROJECTS_DOC_ID !== ''
    ) {
      const projectDocId = '2442231809'
      const confluenceData = await getConfluenceDocument({pageId: projectDocId})

      if (confluenceData) {
        const currentHtml = confluenceData.body.editor.value
        const newVersion = confluenceData.version.number + 1
        const tableContent = getTableContent(currentHtml)
        const tableRows = tableContent.split('</tr>')
        // const newTableRows = []
        // let found = false

        let rowCount = 0
        for (const row of tableRows) {
          if (rowCount !== 0) {
            const cells = row
              .replace('<tr>', '')
              .replace('<td>', '')
              .replace('<td class="confluenceTd">', '')
              .split('</td>')

            core.debug(cells[0])
          }

          rowCount++
        }

        core.debug(newVersion.toString())
      }
    }

    let projectPageId = core.getInput('jiraProjectPage')
    if (projectPageId && projectPageId !== '') {
      projectPageId = projectPageId.replace(
        'https://interactiveknowledge.atlassian.net/wiki/spaces/kb/pages/',
        ''
      )
      projectPageId = projectPageId.substring(0, projectPageId.indexOf('/'))

      // const confluenceData = await getConfluenceDocument({
      //   pageId: projectPageId
      // })

      // core.debug(projectPageId)
      // core.debug(JSON.stringify(confluenceData))
    }

    core.setOutput(
      'Sync jira with open dependabot pulls success',
      new Date().toTimeString()
    )
    return 'success'
  } catch (e) {
    throw e
  }
}
