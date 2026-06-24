import * as core from '@actions/core'
import fetch, {HeaderInit, RequestInit, Response} from 'node-fetch'
import {createIssuePackageString} from './actions'
import {DependabotAlert} from './github'

interface ApiPostParams {
  url: string
  data: object
}

interface ApiRequestResponse {
  data: object
}
interface ApiDocumentResponse {
  body: {
    editor: {
      value: string
    }
  }
  title: string
  version: {
    number: number
  }
}
interface ApiRequestSearchResponse {
  issues: object[]
}

interface JiraIssueDescriptionNode {
  text?: string
  content?: JiraIssueDescriptionNode[]
}

interface JiraIssueDescription {
  content?: JiraIssueDescriptionNode[]
}
interface SearchIssue {
  jql: string
}

interface SearchDocument {
  pageId: string
}

interface CloseResolvedPackageIssues {
  label: string
  projectKey: string
  issueType: string
  repoName: string
  openPackages: string[]
  transitionName?: string
}

function createJiraSafeLabel(value: string, prefix: string): string {
  const normalizedValue = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  const safePrefix = prefix.replace(/[^a-z0-9_]+/g, '')
  const maxLabelLength = 250
  const base = `${safePrefix}_${normalizedValue}`
  return base.substring(0, maxLabelLength)
}

export interface CreateIssue {
  label: string
  projectKey: string
  summary: string
  description: string
  issueType: string
  url: string
  repoName: string
  repoUrl: string
  lastUpdatedAt: string
  pullNumber: string
  alerts?: DependabotAlert[]
}

export interface CreateIssueFromAlert {
  label: string
  projectKey: string
  summary: string
  description: string
  issueType: string
  url: string
  repoName: string
  repoUrl: string
  lastUpdatedAt: string
  severity: string
  vulnerable_version_range: string
  number: string
  package: string
  alerts?: DependabotAlert[]
  issueSummary: string
}

function getJiraAuthorizedHeader(): HeaderInit {
  const email = process.env.JIRA_USER_EMAIL
  const token = process.env.JIRA_API_TOKEN
  core.info(`email ${email}`)
  const authorization = Buffer.from(`${email}:${token}`).toString('base64')
  return {
    Authorization: `Basic ${authorization}`,
    Accept: 'application/json',
    'Content-Type': 'application/json'
  }
}

export function getJiraApiUrlV3(path = '/'): string {
  const subdomain = process.env.JIRA_SUBDOMAIN
  core.info(`subdomain ${subdomain}`)
  const url = `https://${subdomain}.atlassian.net/rest/api/3${path}`
  return url
}

export function getJiraSearchApiUrl(): string {
  const subdomain = process.env.JIRA_SUBDOMAIN
  const url = `https://${subdomain}.atlassian.net/rest/api/3/search/jql`
  return url
}

export function getConfluenceDocumentApiUrl(pageId: string): string {
  const subdomain = process.env.JIRA_SUBDOMAIN
  const url = `https://${subdomain}.atlassian.net/wiki/rest/api/content/${pageId}?expand=body.editor,version`
  return url
}

export async function saveConfluenceDocument(
  pageId: string,
  pageTitle: string,
  newVersion: number,
  newHtml: string
): Promise<ApiRequestResponse> {
  try {
    const subdomain = process.env.JIRA_SUBDOMAIN
    const url = `https://${subdomain}.atlassian.net/wiki/rest/api/content/${pageId}`
    const body = {
      id: pageId,
      title: pageTitle,
      version: {number: newVersion},
      space: {
        key: 'kb'
      },
      type: 'page',
      body: {
        editor: {
          value: newHtml,
          representation: 'editor'
        }
      }
    }

    const response: Response = await fetch(url, {
      method: 'PUT',
      headers: getJiraAuthorizedHeader(),
      body: JSON.stringify(body)
    })

    if (response.status === 200) {
      const responseData = await response.json()
      return {data: responseData}
    } else {
      const error = await response.json()
      const errors = Object.values(error.errors)
      const message = errors.join(',')
      throw Error(message)
    }
  } catch (e) {
    core.error('Error saving confluence doc')
    throw new Error('Error saving confluence doc')
  }
}

export function getMarkupForStatusTags(projectStatus: string): string {
  if (projectStatus === 'security') {
    return '<p><img class="editor-inline-macro" height="18" width="88" src="/wiki/plugins/servlet/status-macro/placeholder?title=security+Update&amp;colour=Red" data-macro-name="status" data-macro-id="4153bbe0-727b-414b-997a-a96bc1feb2e7" data-macro-parameters="colour=Red|title=security Update" data-macro-schema-version="1"></p>'
  } else {
    return '<p><img class="editor-inline-macro" height="18" width="88" src="/wiki/plugins/servlet/status-macro/placeholder?title=Up+To+Date&amp;colour=Green" data-macro-name="status" data-macro-id="cff9a3ad-9446-4833-98b6-beec42cf6727" data-macro-parameters="colour=Green|title=Up To Date" data-macro-schema-version="1"></p>'
  }
}

async function jiraApiPost(params: ApiPostParams): Promise<ApiRequestResponse> {
  try {
    const {url, data} = params
    const fetchParams: RequestInit = {
      body: JSON.stringify(data),
      headers: getJiraAuthorizedHeader(),
      method: 'POST'
    }
    const response: Response = await fetch(url, fetchParams)
    if (response.status === 201) {
      const responseData = await response.json()
      return {data: responseData}
    } else {
      const error = await response.json()
      const errors = Object.values(error.errors)
      const message = errors.join(',')
      throw Error(message)
    }
  } catch (e) {
    throw new Error('Post error')
  }
}

async function addLabelsToJiraIssue(
  issueKey: string,
  labels: string[]
): Promise<void> {
  const body = {
    update: {
      labels: labels.map(label => ({
        add: label
      }))
    }
  }

  const response = await fetch(getJiraApiUrlV3(`/issue/${issueKey}`), {
    method: 'PUT',
    headers: getJiraAuthorizedHeader(),
    body: JSON.stringify(body)
  })

  if (response.status === 204) {
    return
  }

  try {
    const error = await response.json()
    core.error(error)
  } catch (e) {
    core.error('error in addLabelsToJiraIssue response.json()')
  }

  throw new Error('Failed to update issue labels')
}

async function updateJiraIssueDescription(
  issueKey: string,
  bodyContent: Record<string, unknown>[]
): Promise<void> {
  const body = {
    fields: {
      description: {
        content: bodyContent,
        type: 'doc',
        version: 1
      }
    }
  }

  const response = await fetch(getJiraApiUrlV3(`/issue/${issueKey}`), {
    method: 'PUT',
    headers: getJiraAuthorizedHeader(),
    body: JSON.stringify(body)
  })

  if (response.status === 204) {
    return
  }

  try {
    const error = await response.json()
    core.error(error)
  } catch (e) {
    core.error('error in updateJiraIssueDescription response.json()')
  }

  throw new Error('Failed to update issue description')
}

function collectTextFromDescriptionNodes(
  nodes: JiraIssueDescriptionNode[]
): string[] {
  const output: string[] = []

  for (const node of nodes) {
    if (node.text) {
      output.push(node.text)
    }

    if (node.content && node.content.length > 0) {
      output.push(...collectTextFromDescriptionNodes(node.content))
    }
  }

  return output
}

function extractAlertNumbersFromDescription(
  description?: JiraIssueDescription
): Set<string> {
  const nodes = description?.content || []
  const text = collectTextFromDescriptionNodes(nodes).join('\n')
  const matches = text.matchAll(/-\s*(\d+):/g)
  const alertNumbers = new Set<string>()

  for (const match of matches) {
    alertNumbers.add(match[1])
  }

  return alertNumbers
}

async function getJiraIssueAlertNumbers(
  issueKey: string
): Promise<Set<string>> {
  const response = await fetch(
    getJiraApiUrlV3(`/issue/${issueKey}?fields=description`),
    {
      method: 'GET',
      headers: getJiraAuthorizedHeader()
    }
  )

  if (response.status !== 200) {
    try {
      const error = await response.json()
      core.error(error)
    } catch (e) {
      core.error('error in getJiraIssueAlertNumbers response.json()')
    }

    throw new Error('Failed to load Jira issue description')
  }

  const issueResponse = (await response.json()) as {
    fields?: {description?: JiraIssueDescription}
  }

  return extractAlertNumbersFromDescription(issueResponse.fields?.description)
}

function hasAlertNumberDifference(
  existingAlertNumbers: Set<string>,
  incomingAlertNumbers: Set<string>
): boolean {
  if (existingAlertNumbers.size !== incomingAlertNumbers.size) {
    return true
  }

  for (const number of incomingAlertNumbers) {
    if (!existingAlertNumbers.has(number)) {
      return true
    }
  }

  return false
}

function buildIssueBodyContent({
  severity,
  summary,
  vulnerable_version_range,
  description,
  repoName,
  repoUrl,
  lastUpdatedAt,
  packageName,
  packageMarkerString,
  alertItems,
  includeUpdatedNotice = false
}: {
  severity: string
  summary: string
  vulnerable_version_range: string
  description: string
  repoName: string
  repoUrl: string
  lastUpdatedAt: string
  packageName: string
  packageMarkerString: string
  alertItems: DependabotAlert[]
  includeUpdatedNotice?: boolean
}): Record<string, unknown>[] {
  const bodyContent: Record<string, unknown>[] = []

  if (includeUpdatedNotice) {
    bodyContent.push({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'NOTE: This issue was updated because the open Dependabot alert numbers changed.'
        }
      ]
    })
  }

  bodyContent.push(
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: `------ ${severity.toUpperCase()} Vulnerability ------`
        }
      ]
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: summary
        }
      ]
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: `Version Range Affected: ${vulnerable_version_range}`
        }
      ]
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: description
        }
      ]
    },
    {
      type: 'paragraph',
      content: [
        {
          text: `Application repo: ${repoName}`,
          type: 'text',
          marks: [
            {
              type: 'link',
              attrs: {
                href: repoUrl
              }
            }
          ]
        }
      ]
    },
    {
      type: 'paragraph',
      content: [
        {
          text: `Last updated at: ${lastUpdatedAt}`,
          type: 'text'
        }
      ]
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: `Alerts (${alertItems.length}):`
        }
      ]
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: `Package: ${packageName}`
        }
      ]
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: packageMarkerString
        }
      ]
    }
  )

  for (const alertItem of alertItems) {
    bodyContent.push({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: `- ${alertItem.number}: ${alertItem.summary} `
        },
        {
          type: 'text',
          text: alertItem.url,
          marks: [
            {
              type: 'link',
              attrs: {
                href: alertItem.url
              }
            }
          ]
        }
      ]
    })
  }

  return bodyContent
}

export async function jiraApiSearch({
  jql
}: SearchIssue): Promise<ApiRequestSearchResponse> {
  try {
    const getUrl = `${getJiraSearchApiUrl()}?jql=${encodeURIComponent(
      jql
    )}&fields=key,labels`
    core.info(`jql ${jql}`)
    const requestParams: RequestInit = {
      method: 'GET',
      headers: getJiraAuthorizedHeader()
    }
    const response = await fetch(getUrl, requestParams)
    if (response.status === 200) {
      return await response.json()
    } else {
      core.debug(JSON.stringify(response))
      const error = await response.json()
      const errors = Object.values(error.errorMessages)
      const message = errors.join(',')
      throw Error(message)
    }
  } catch (e) {
    core.error('Error getting the existing issue')
    throw new Error('Error getting the existing issue')
  }
}

export async function closeResolvedPackageJiraIssues({
  label,
  projectKey,
  issueType,
  repoName,
  openPackages,
  transitionName = 'done'
}: CloseResolvedPackageIssues): Promise<void> {
  const repoLabel = createJiraSafeLabel(repoName, 'dependabot_repo')
  const openPackageLabels = new Set(
    openPackages.map(item => createJiraSafeLabel(item, 'dependabot_pkg'))
  )
  const jql = `labels="${label}" AND labels="${repoLabel}" AND project="${projectKey}" AND issuetype="${issueType}" AND statusCategory != Done`
  const existingIssuesResponse = await jiraApiSearch({jql})

  for (const issue of existingIssuesResponse.issues as {
    key?: string
    fields?: {labels?: string[]}
  }[]) {
    const issueKey = issue.key
    const labelsForIssue = issue.fields?.labels || []
    const packageLabel = labelsForIssue.find(item =>
      item.startsWith('dependabot_pkg_')
    )

    if (!issueKey || !packageLabel || openPackageLabels.has(packageLabel)) {
      continue
    }

    try {
      await closeJiraIssue(issueKey, transitionName)
      core.debug(`Closed Jira issue ${issueKey} for resolved package`)
    } catch (e) {
      core.debug(`Failed to close Jira issue ${issueKey} for resolved package`)
    }
  }
}

export async function createJiraIssueFromAlerts({
  label,
  projectKey,
  issueType = 'Story',
  repoName,
  repoUrl,
  url,
  lastUpdatedAt,
  number,
  package: packageName,
  alerts,
  severity,
  vulnerable_version_range,
  description,
  issueSummary,
  summary
}: CreateIssueFromAlert): Promise<ApiRequestResponse> {
  const packageMarkerString = createIssuePackageString(packageName)
  const packageLabel = createJiraSafeLabel(packageName, 'dependabot_pkg')
  const repoLabel = createJiraSafeLabel(repoName, 'dependabot_repo')

  const jql = `labels="${label}" AND labels="${packageLabel}" AND labels="${repoLabel}" AND project="${projectKey}" AND issuetype="${issueType}"`
  const existingIssuesResponse = await jiraApiSearch({
    jql
  })
  const foundByPrimaryLabels = existingIssuesResponse.issues.length > 0

  const legacyJql = `(description~"${packageMarkerString}" OR AND description~"${repoName}" AND labels="${label}" AND project="${projectKey}" AND issuetype="${issueType}"`
  const legacyIssuesResponse =
    existingIssuesResponse.issues.length > 0
      ? existingIssuesResponse
      : await jiraApiSearch({jql: legacyJql})

  const alertItems =
    alerts && alerts.length > 0
      ? alerts
      : [
          {
            url,
            summary,
            number,
            severity,
            description,
            vulnerable_version_range,
            lastUpdatedAt,
            package: packageName
          }
        ]

  const bodyContent = buildIssueBodyContent({
    severity,
    summary,
    vulnerable_version_range,
    description,
    repoName,
    repoUrl,
    lastUpdatedAt,
    packageName,
    packageMarkerString,
    alertItems
  })

  if (
    legacyIssuesResponse &&
    legacyIssuesResponse.issues &&
    legacyIssuesResponse.issues.length > 0
  ) {
    const existingIssue = legacyIssuesResponse.issues[0] as {key?: string}

    if (!foundByPrimaryLabels && existingIssue.key) {
      try {
        await addLabelsToJiraIssue(existingIssue.key, [
          label,
          packageLabel,
          repoLabel
        ])
        core.debug(`Backfilled package/repo labels on ${existingIssue.key}`)
      } catch (e) {
        core.debug('Failed to backfill package/repo labels on existing issue')
      }
    }

    if (existingIssue.key) {
      try {
        const existingAlertNumbers = await getJiraIssueAlertNumbers(
          existingIssue.key
        )
        const incomingAlertNumbers = new Set(
          alertItems.map(item => item.number.toString())
        )

        if (
          hasAlertNumberDifference(existingAlertNumbers, incomingAlertNumbers)
        ) {
          const updatedBodyContent = buildIssueBodyContent({
            severity,
            summary,
            vulnerable_version_range,
            description,
            repoName,
            repoUrl,
            lastUpdatedAt,
            packageName,
            packageMarkerString,
            alertItems,
            includeUpdatedNotice: true
          })

          await updateJiraIssueDescription(
            existingIssue.key,
            updatedBodyContent
          )
          core.debug(`Updated existing issue ${existingIssue.key}`)
        }
      } catch (e) {
        core.debug(`Failed to update existing issue ${existingIssue.key}`)
      }
    }

    core.debug(`Has existing issue skipping`)
    core.debug(JSON.stringify(existingIssue))
    return {data: existingIssue}
  }
  core.debug(`Did not find exising, trying create`)

  const body = {
    fields: {
      labels: [label, packageLabel, repoLabel],
      project: {
        key: projectKey
      },
      summary: issueSummary,
      description: {
        content: bodyContent,
        type: 'doc',
        version: 1
      },
      issuetype: {
        name: issueType
      }
    },
    update: {}
  }

  const data = await jiraApiPost({
    url: getJiraApiUrlV3('/issue'),
    data: body
  })
  core.debug(`Create issue success`)
  return {data: data.data}
}

export async function closeJiraIssue(
  issueId: string,
  transitionName = 'done'
): Promise<ApiRequestResponse> {
  core.debug(`Closing jira issue`)
  const body = {
    transition: {
      id: -1
    },
    update: {
      comment: [
        {
          add: {
            body: {
              content: [
                {
                  content: [
                    {
                      text: 'Closed by ik_devs dependabot action',
                      type: 'text'
                    }
                  ],
                  type: 'paragraph'
                }
              ],
              type: 'doc',
              version: 1
            }
          }
        }
      ]
    }
  }

  const transitionsResponse = await fetch(
    getJiraApiUrlV3(`/issue/${issueId}/transitions`),
    {
      method: 'GET',
      headers: getJiraAuthorizedHeader()
    }
  )
  if (transitionsResponse.status === 200) {
    const transitionsData = await transitionsResponse.json()
    const transition = transitionsData.transitions.find(
      (item: {name: string}) => {
        if (item.name.toLowerCase() === transitionName.toLowerCase()) {
          return item
        }
      }
    )
    body.transition.id = transition.id
    const updateIssueResponse = await fetch(
      getJiraApiUrlV3(`/issue/${issueId}/transitions`),
      {
        body: JSON.stringify(body),
        headers: getJiraAuthorizedHeader(),
        method: 'POST'
      }
    )
    if (updateIssueResponse.status === 204) {
      return {
        data: {
          success: true
        }
      }
    } else {
      try {
        const error = await updateIssueResponse.json()
        core.error(error)
      } catch (e) {
        core.error('error in updateIssueResponse.json()')
      }
      throw new Error('Failed to update issue')
    }
  } else {
    try {
      const error = await transitionsResponse.json()
      core.error(error)
    } catch (e) {
      core.error('error in transitionsResponse.json()')
    }
    throw new Error('Failed get transition id')
  }
}

export async function getConfluenceDocument({
  pageId
}: SearchDocument): Promise<ApiDocumentResponse> {
  try {
    const getUrl = getConfluenceDocumentApiUrl(pageId)
    const requestParams: RequestInit = {
      method: 'GET',
      headers: getJiraAuthorizedHeader()
    }

    const response = await fetch(getUrl, requestParams)

    if (response.status === 200) {
      return await response.json()
    } else {
      const error = await response.json()
      const errors = Object.values(error.errorMessages)
      const message = errors.join(',')
      throw Error(message)
    }
  } catch (e) {
    core.error('Error getting the existing issue')
    throw new Error('Error getting the existing issue')
  }
}
