
# Dependaobot to JIRA Issue Sync Action

Use this github action to create Jira issue from the dependabot alerts created in a IK project repo. (Customized from [sprout-tech/dependabot-jira-action](https://github.com/sprout-tech/dependabot-jira-action)) Additinally we have added the ability to update confluence documents associated with the project to create a report of sites' statuses.

# Usage

See [action.yml](action.yml)

```yaml
name: Update JIRA with dependabot issues
on:
  # Run on schedule
  schedule: 
    - cron: '0 */12 * * *'
  # Run after Dependabot Updates workflow.
  workflow_run:
    workflows: [Dependabot Updates]
    types:
      - completed
    branches: 
      - master
      - main
jobs:
  jira:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: read
    steps:
      - name: Dependabot JIRA Action
        uses: interactiveknowledge/dependabot-jira-action@main
        with:
          jiraIssueLabel: security-update
          jiraProjectKey: ARW
          jiraIssueType: Story
          githubRepo: project_abt_revwar
          githubOwner: interactiveknowledge
          closeIssueOnMerge: "false"
          ikProjectDomain: "american-revolution-experience.battlefields.org"
          jiraProjectPage: "https://interactiveknowledge.atlassian.net/wiki/spaces/kb/pages/2619802145"
          ikDevSite: "https://battlefields-revwar-dev.herokuapp.com/"
          ikTeamworkProject: "https://interactiveknowledge.teamwork.com/#/projects/650734"
          frameworksInfo: 'React'
          databaseInfo: 'N/A'
          serverInfo: 'Heroku'
        env:
        # All these are in the interactiveknowledge organization secrets. If outside our organization, 
        # these will need to be added to the repo secrets at https://github.com/***/***/settings/secrets/actions
          JIRA_SUBDOMAIN: ${{ secrets.JIRA_SUBDOMAIN }}
          JIRA_USER_EMAIL: ${{ secrets.JIRA_USER_EMAIL }}
          JIRA_API_TOKEN: ${{ secrets.JIRA_API_TOKEN }}
          GITHUB_API_TOKEN: ${{ secrets.CUSTOM_GITHUB_TOKEN }}
          CONFLUENCE_PROJECTS_DOC_ID: ${{ secrets.CONFLUENCE_PROJECTS_DOC_ID }}
```

# License

The scripts and documentation in this project are released under the [MIT License](LICENSE)

## Development

> Node 18.x

Install the dependencies  
```bash
$ npm install
```

Build the typescript and package it for distribution
```bash
$ npm run build && npm run package
```

Run the tests :heavy_check_mark:  
```bash
$ npm test

 PASS  ./index.test.js
  ✓ throws invalid number (3ms)
  ✓ wait 500 ms (504ms)
  ✓ test runs (95ms)

...
```

## Documention for action.yml

The action.yml defines the inputs and output for your action.

Update the action.yml with your name, description, inputs and outputs for your action.

See the [documentation](https://help.github.com/en/articles/metadata-syntax-for-github-actions)

See the [toolkit documentation](https://github.com/actions/toolkit/blob/master/README.md#packages) for the various packages.

## Publish to a distribution branch

Actions are run from GitHub repos so we will checkin the packed dist folder. 

Then run [ncc](https://github.com/zeit/ncc) and push the results:
```bash
$ npm run package
$ git add dist
$ git commit -a -m "New version with dependencies"
$ git push origin releases/v1
```

Note: We recommend using the `--license` option for ncc, which will create a license file for all of the production node modules used in your project.

Your action is now published! :rocket: 

See the [versioning documentation](https://github.com/actions/toolkit/blob/master/docs/action-versioning.md)

## Validate

You can now validate the action by referencing `./` in a workflow in your repo (see [test.yml](.github/workflows/test.yml))

```yaml
permissions:
  pull-requests: read
steps:
  - uses: actions/checkout@v2
  - uses: ./
    with:
      jiraIssueLabel: dependabot
      jiraProjectKey: TGA
      jiraIssueType: Bug
      githubRepo: dependabot-jira-action
      githubOwner: sprout-tech
    environment:
      JIRA_SUBDOMAIN: ${{ env.JIRA_SUBDOMAIN }}
      JIRA_USER_EMAIL: ${{ env.JIRA_USER_EMAIL }}
      JIRA_API_TOKEN: ${{ secrets.JIRA_API_TOKEN }}
      GITHUB_API_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

See the [actions tab](https://github.com/actions/typescript-action/actions) for runs of this action! :rocket:

## Usage:

After testing you can [create a v1 tag](https://github.com/actions/toolkit/blob/master/docs/action-versioning.md) to reference the stable and latest V1 action
