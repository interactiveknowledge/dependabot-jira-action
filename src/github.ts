import {getOctokit} from '@actions/github'
import * as core from '@actions/core'

export interface GetPullRequestParams {
  owner: string
  repo: string
}

export interface GetPullRequestByIdParams {
  owner: string
  repo: string
  issueNumber: string
}

export interface DependabotAlert {
  url: string
  severity: string
  vulnerable_version_range: string
  lastUpdatedAt: string
  number: string
}
export interface PullRequest {
  url: string
  summary: string
  description: string
  repoName: string
  repoUrl: string
  lastUpdatedAt: string
  pullNumber: string
  alerts?: DependabotAlert[]
}

interface GetPullRequestByIdResponse {
  id: number
  url: string
  state: string
}

export async function getDependabotOpenPullRequests(
  params: GetPullRequestParams
): Promise<PullRequest[]> {
  const {owner, repo} = params
  const githubApiKey = process.env.GITHUB_API_TOKEN || ''
  const octokit = getOctokit(githubApiKey)
  const dependabotLoginName = 'dependabot[bot]'
  const {data} = await octokit.request(
    'GET /repos/{owner}/{repo}/pulls?state=open',
    {
      owner,
      repo,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28'
      }
    }
  )
  const items = []
  for (const pull of data) {
    if (pull?.user?.login === dependabotLoginName) {
      let packageName = pull.title.replace('Bump ', '')
      packageName = packageName.substring(0, packageName.indexOf(' from'))
      const alerts = []

      const alertData = await octokit.request(
        'GET /repos/{owner}/{repo}/dependabot/alerts?package={packageName}&state=open',
        {
          owner,
          repo,
          packageName,
          headers: {
            'X-GitHub-Api-Version': '2022-11-28'
          }
        }
      )

      if (alertData.data) {
        for (const alert of alertData.data) {
          const alertItem: DependabotAlert = {
            number: alert.number,
            url: alert.html_url,
            severity: alert.security_vulnerability.severity,
            vulnerable_version_range:
              alert.security_vulnerability.vulnerable_version_range,
            lastUpdatedAt: alert.updated_at
          }

          alerts.push(alertItem)
        }
      }

      const item: PullRequest = {
        url: pull.html_url,
        summary: `Dependabot alert: ${pull.title}`,
        description: pull.body,
        repoName: pull.base.repo.name,
        repoUrl: pull.base.repo.html_url.replace('***', owner),
        lastUpdatedAt: pull.updated_at,
        pullNumber: pull.number.toString(),
        alerts
      }
      items.push(item)
    }
  }
  return items
}

export async function getPullRequestByIssueId(
  params: GetPullRequestByIdParams
): Promise<GetPullRequestByIdResponse> {
  const {owner, repo, issueNumber} = params
  const githubApiKey = process.env.GITHUB_API_TOKEN || ''
  const octokit = getOctokit(githubApiKey)
  try {
    const {data} = await octokit.request(
      'GET /repos/{owner}/{repo}/pulls/{pull_number}',
      {
        owner,
        repo,
        pull_number: Number(issueNumber),
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }
    )
    return data
  } catch (e) {
    return {
      id: -1,
      url: 'none',
      state: 'none'
    }
  }
}
