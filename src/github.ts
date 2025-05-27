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

export interface PullRequest {
  url: string
  summary: string
  description: string
  repoName: string
  repoUrl: string
  lastUpdatedAt: string
  pullNumber: string
}

export interface DependabotAlert {
  url: string
  severity: string
  summary: string
  description: string
  repoName: string
  repoUrl: string
  lastUpdatedAt: string
  pullNumber: string
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
      const item: PullRequest = {
        url: pull.html_url,
        summary: `Dependabot alert for ${repo}: ${pull.title}`,
        description: pull.body,
        repoName: pull.base.repo.name,
        repoUrl: pull.base.repo.html_url.replace('***', owner),
        lastUpdatedAt: pull.updated_at,
        pullNumber: pull.number.toString()
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

export async function getDependabotOpenAlerts(
  params: GetPullRequestParams
): Promise<DependabotAlert[]> {
  const {owner, repo} = params
  const githubApiKey = process.env.GITHUB_API_TOKEN || ''
  const octokit = getOctokit(githubApiKey)
  const {data} = await octokit.request(
    'GET /repos/{owner}/{repo}/dependabot/alerts?state=open',
    {
      owner,
      repo,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28'
      }
    }
  )
  const items = []
  for (const alert of data) {
    const packageName = [
      alert.security_vulnerability.package?.ecosystem,
      alert.security_vulnerability.package.name
    ].join('/')

    core.debug(alert)

    const item: DependabotAlert = {
      url: alert.html_url,
      severity: alert.security_vulnerability.severity,
      summary: `Dependabot alert for ${repo}: [${alert.security_vulnerability.severity}] ${packageName} ${alert.security_vulnerability.vulnerable_version_range}`,
      description: `${alert.security_advisory.summary}: ${alert.security_advisory.description}`,
      repoName: repo,
      repoUrl: `https://github.com/${owner}/${repo}`,
      lastUpdatedAt: alert.updated_at,
      pullNumber: alert.number.toString()
    }
    items.push(item)
  }
  return items
}
