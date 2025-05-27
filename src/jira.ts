import * as core from '@actions/core'
import fetch, {HeaderInit, RequestInit, Response} from 'node-fetch'
import {
  createIssueAlertNumberString,
  createIssuePullNumberString
} from './actions'
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
  version: {
    number: number
  }
}
interface ApiRequestSearchResponse {
  issues: object[]
}
interface SearchIssue {
  jql: string
}

interface SearchDocument {
  pageId: string
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
  const url = `https://${subdomain}.atlassian.net/rest/api/2/search`
  return url
}

export function getConfluenceDocumentApiUrl(pageId: string): string {
  const subdomain = process.env.JIRA_SUBDOMAIN
  const url = `https://${subdomain}.atlassian.net/wiki/rest/api/content/${pageId}?expand=body.editor,version`
  return url
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

export async function jiraApiSearch({
  jql
}: SearchIssue): Promise<ApiRequestSearchResponse> {
  try {
    const getUrl = `${getJiraSearchApiUrl()}?jql=${encodeURIComponent(jql)}`
    core.info(`jql ${jql}`)
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

export async function createJiraIssue({
  label,
  projectKey,
  summary,
  issueType = 'Story',
  repoName,
  repoUrl,
  url,
  lastUpdatedAt,
  pullNumber,
  alerts
}: CreateIssue): Promise<ApiRequestResponse> {
  const issueNumberString = createIssuePullNumberString(pullNumber)
  const jql = `summary~"${summary}" AND description~"${issueNumberString}" AND description~"${repoName}" AND labels="${label}" AND project="${projectKey}" AND issuetype="${issueType}"`
  const existingIssuesResponse = await jiraApiSearch({
    jql
  })
  if (
    existingIssuesResponse &&
    existingIssuesResponse.issues &&
    existingIssuesResponse.issues.length > 0
  ) {
    core.debug(`Has existing issue skipping`)
    return {data: existingIssuesResponse.issues[0]}
  }
  core.debug(`Did not find exising, trying create`)
  const bodyContent = [
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
          text: `Pull request last updated at: ${lastUpdatedAt}`,
          type: 'text'
        }
      ]
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: `Pull request url: `
        },
        {
          type: 'text',
          text: `${url}`,
          marks: [
            {
              type: 'link',
              attrs: {
                href: url
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
          type: 'text',
          text: issueNumberString
        }
      ]
    }
  ]

  if (alerts && alerts.length > 0) {
    for (const alert of alerts) {
      bodyContent.push({
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: `------ ${alert.severity.toUpperCase()} Vulnerability ------`
          }
        ]
      })

      bodyContent.push({
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: `Version Range: ${alert.vulnerable_version_range}`
          }
        ]
      })

      bodyContent.push({
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: alert.description
          }
        ]
      })
      bodyContent.push({
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: `Alert Number ${alert.number}`,
            marks: [
              {
                type: 'link',
                attrs: {
                  href: alert.url
                }
              }
            ]
          }
        ]
      })
      bodyContent.push({
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: `------------`
          }
        ]
      })
    }
  }

  const body = {
    fields: {
      labels: [label],
      project: {
        key: projectKey
      },
      summary,
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
  return {data}
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
  severity,
  vulnerable_version_range,
  description,
  issueSummary
}: CreateIssueFromAlert): Promise<ApiRequestResponse> {
  const issueNumberString = createIssueAlertNumberString(number)
  const jql = `summary~"${issueSummary}" AND description~"${issueNumberString}" AND description~"${repoName}" AND labels="${label}" AND project="${projectKey}" AND issuetype="${issueType}"`
  const existingIssuesResponse = await jiraApiSearch({
    jql
  })
  if (
    existingIssuesResponse &&
    existingIssuesResponse.issues &&
    existingIssuesResponse.issues.length > 0
  ) {
    core.debug(`Has existing issue skipping`)
    return {data: existingIssuesResponse.issues[0]}
  }
  core.debug(`Did not find exising, trying create`)
  const bodyContent = [
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
          text: `Alert url: `
        },
        {
          type: 'text',
          text: `${url}`,
          marks: [
            {
              type: 'link',
              attrs: {
                href: url
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
          type: 'text',
          text: issueNumberString
        }
      ]
    }
  ]

  const body = {
    fields: {
      labels: [label],
      project: {
        key: projectKey
      },
      issueSummary,
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
  return {data}
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
                      text: 'Closed by dependabot',
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
