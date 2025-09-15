import * as process from 'process'
import {expect, test} from '@jest/globals'
import {getJiraApiUrlV3, getJiraSearchApiUrl} from '../src/jira'
// import {createIssueAlertNumberString, extractIssueNumber} from '../src/actions'

test('test create jira api url', async () => {
  const subdomain = 'test-domain'
  const path = '/tester'
  process.env['JIRA_SUBDOMAIN'] = subdomain
  expect(getJiraApiUrlV3(path)).toEqual(
    `https://${subdomain}.atlassian.net/rest/api/3${path}`
  )
})

test('test create jira search url', async () => {
  const subdomain = 'test-domain'
  process.env['JIRA_SUBDOMAIN'] = subdomain
  expect(getJiraSearchApiUrl()).toEqual(
    `https://${subdomain}.atlassian.net/rest/api/3/search/jql`
  )
})

// test('extra issue number from description', async () => {
//   const issueNumber = '42'
//   const issueNumberString = createIssueAlertNumberString(issueNumber.toString())
//   const issueNumberExtracted = extractIssueNumber(`
//     ${issueNumberString}
//   `)
//   expect(issueNumberExtracted).toEqual(issueNumber)
// })
