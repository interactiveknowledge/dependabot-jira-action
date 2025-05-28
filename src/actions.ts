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
  getMarkupForStatusTags,
  createJiraIssueFromAlerts,
  saveConfluenceDocument
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

export interface BuildTableRow {
  repo: string
  owner: string
  projectKey: string
  projectStatus: string
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

export function buildNewTableRow({
  projectKey,
  projectStatus,
  owner,
  repo
}: BuildTableRow): string {
  const currentDate = new Date().toLocaleDateString()
  const statusTag = getMarkupForStatusTags(projectStatus)
  const repoUrl = `https://github.com/${owner}/${repo}`
  const ikProjectDomain = core.getInput('ikProjectDomain')
  const jiraProjectPage = core.getInput('jiraProjectPage')
  const ikTeamworkProject = core.getInput('ikTeamworkProject')
  const frameworksInfo = core.getInput('frameworksInfo')
  const databaseInfo = core.getInput('databaseInfo')
  const serverInfo = core.getInput('serverInfo')

  let output = '<tr>'
  // Project Key
  output += `<td class="confluenceTd"><p>${projectKey}</p></td>`
  // Site Urls
  output += `<td class="confluenceTd">`

  if (ikProjectDomain && ikProjectDomain !== '') {
    output += `<p>${ikProjectDomain}</p>`
  }

  output += `<ul>`

  if (ikProjectDomain && ikProjectDomain !== '') {
    output += `<li><a href="https://${ikProjectDomain} target="_blank">live site</a></li>`
  }

  output += `<li><a href="https://interactiveknowledge.atlassian.net/browse/${projectKey} target="_blank">jira project</a></li>`

  if (jiraProjectPage && jiraProjectPage !== '') {
    output += `<li><a href="${jiraProjectPage} target="_blank">confluence notes</a></li>`
  }

  if (ikTeamworkProject && ikTeamworkProject !== '') {
    output += `<li><a href="${ikTeamworkProject} target="_blank">teamwork project</a></li>`
  }

  output += `<li><a href="${repoUrl} target="_blank">github project</a></li>`

  output += `</ul>`

  output += `</td>`
  // Status
  output += `<td class="confluenceTd">${statusTag}${
    projectStatus !== 'none'
      ? `<p><a href="${jiraProjectPage} target="_blank">see details</a></p>`
      : ''
  }</td>`
  // Frameworks
  output += `<td class="confluenceTd"><p>${
    frameworksInfo !== '' ? frameworksInfo : 'N/A'
  }</p></td>`
  // PHP Version
  output += `<td class="confluenceTd"><p>N/A</p></td>`
  // Database Information
  output += `<td class="confluenceTd"><p>${
    databaseInfo !== '' ? databaseInfo : 'N/A'
  }</p></td>`
  // Server Information
  output += `<td class="confluenceTd"><p>${
    serverInfo !== '' ? serverInfo : 'N/A'
  }</p></td>`
  // Last Checked
  output += `<td class="confluenceTd"><p>${currentDate}<img class="editor-inline-macro" height="18" width="88" src="/wiki/plugins/servlet/status-macro/placeholder?title=automatically&amp;colour=Purple" data-macro-name="status" data-macro-id="9e4125f0-89a1-4143-a6cd-babe9f33f38c" data-macro-parameters="colour=Purple|title=automatically via github actions" data-macro-schema-version="1"></p></td>`
  output += '</tr>'

  return output
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

    // Update confluence.
    // Projects & Hosting Documents
    if (
      process.env.CONFLUENCE_PROJECTS_DOC_ID &&
      process.env.CONFLUENCE_PROJECTS_DOC_ID !== ''
    ) {
      const projectDocId = process.env.CONFLUENCE_PROJECTS_DOC_ID
      const confluenceData = await getConfluenceDocument({pageId: projectDocId})

      if (confluenceData) {
        const currentHtml = confluenceData.body.editor.value
        const newVersion = confluenceData.version.number + 1
        const pageTitle = confluenceData.title
        const tableContent = getTableContent(currentHtml)
        const tableRows = tableContent.split('</tr>')
        const newRowValue = buildNewTableRow({
          projectKey,
          projectStatus,
          owner,
          repo
        })
        const newTableRows = []
        let found = false

        let rowCount = 0
        for (const row of tableRows) {
          if (rowCount !== 0) {
            // let isMatch = false
            const cells = row
              .replace('<tr>', '')
              .replace('<td>', '')
              .replace('<td class="confluenceTd">', '')
              .split('</td>')

            const rowProjectKey = cells[0].replace(/<[^>]*>/g, '').trim()

            if (rowProjectKey === projectKey) {
              found = true
              newTableRows.push(newRowValue)
            } else {
              newTableRows.push(row)
            }
          } else {
            newTableRows.push(row)
          }

          rowCount++
        }

        if (found === false) {
          newTableRows.push(newRowValue)
        }

        const newTableContent = newTableRows.join('')
        const newHtml = currentHtml.replace(tableContent, newTableContent)

        await saveConfluenceDocument(
          projectDocId,
          pageTitle,
          newVersion,
          newHtml
        )

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

    for (const pull of dependabotPulls) {
      const jiraTicketData = await createJiraIssue({
        label,
        projectKey,
        issueType,
        ...pull
      })

      jiraTickets.push({
        jiraTicketData,
        label,
        projectKey,
        issueType,
        ...pull
      })
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
