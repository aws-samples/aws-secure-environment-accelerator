# Contributing Guidelines

Thank you for your interest in contributing to our project. Whether it's a bug report, new feature, correction, or additional
documentation, we greatly value feedback and contributions from our community.

Please read through this document before submitting any issues or pull requests to ensure we have all the necessary
information to effectively respond to your bug report or contribution.

## Project Governance

The AWS Secure Environment Accelerator will use GitHub [Issues](https://docs.github.com/en/github/managing-your-work-on-github/creating-an-issue) and [Pull Request](https://docs.github.com/en/github/collaborating-with-issues-and-pull-requests/creating-a-pull-request) mechanisms for community engagement. AWS employees, AWS partners, customers and the general public, can create Issue(s) for the repo, such as: bugs, feature requests, or questions on the code itself. You should not communicate [security](#security-issue-notifications) issues through GitHub.

Stakeholders are also encouraged to create Pull Requests that could potentially address issues or add functionality. Stakeholders can also express sentiments on issues such as upvote/downvote in order to influence prioritization. The Product Manager, working with all stakeholders, will use a GitHub Kanban board to publicly document the ongoing project work and prioritization using the available feedback.

## Reporting Bugs/Feature Requests

We welcome you to use the GitHub issue tracker to report bugs or suggest features.

When filing an issue, please check existing open, or recently closed, issues to make sure somebody else hasn't already
reported the issue. Please try to include as much information as you can. Details like these are incredibly useful:

- The version of our code being used
- A reproducible test case or series of steps
- Any modifications you've made relevant to the bug
- Anything unusual about your environment or deployment
- Error messages and information as detailed in Section 4 of the Accelerator Operations & Troubleshooting Guide

## Contributing via Pull Requests

Contributions via pull requests are much appreciated. Before sending us a pull request, please ensure that:

1. You are working against the latest source on the _master_ branch.
2. You check existing open, and recently merged, pull requests to make sure someone else hasn't addressed the problem already.
3. You open an issue to discuss any significant work - we would hate for your time to be wasted.
4. You have reviewed and are aligned with the `Accelerator Development First Principles`

To send us a pull request, please:

1. Fork the repository.
2. Modify the source; please focus on the specific change you are contributing. If you also reformat all the code, it will be hard for us to focus on your change.
3. Ensure local tests pass.
4. Commit to your fork using clear commit messages.
5. Send us a pull request, answering any default questions in the pull request interface.
6. Pay attention to any automated CI failures reported in the pull request, and stay involved in the conversation.

GitHub provides additional document on [forking a repository](https://help.github.com/articles/fork-a-repo/) and
[creating a pull request](https://help.github.com/articles/creating-a-pull-request/).

## Accelerator Development First Principles:

1. All code needs to include proper and complete error handling including back-off and retry functionality
2. If a security guardrail fails to be deployed, all code must result in a state machine failure, with a descriptive message as to the cause of the fault
3. All code, on failure, needs to properly and completely roll-back or cleanup. On a failure, users should not be required to manually cleanup in order to re-run the state machine
4. All reasonable efforts should be taken to ensure resources don't fail to deploy (again retries or corrective code to prevent hitting common error situations)
5. All code changes need to accommodate both new deployments and upgrades from _any_ existing Accelerator version. A smooth upgrade path must be provided for existing customers. In certain cases an automated pre-upgrade procedure could be provided to existing customers to perform before an upgrade to enable a smooth upgrade. This cannot involve removing non-idempotent resources (i.e. MAD). For example, you must remove your VPC endpoints prior to upgrade.
6. All code should be delivered as Typescript. The project has worked hard to ensure a consistent and single language and runtime to ensure long-term supportability
7. When developing, CDK should be selected first, a Custom Resource second, and only when the first two are not viable solutions, should a Lambda be considered
8. When adding new features, they must be off by default and enabled with a new config file variable, allowing customers the option to enable and disable the feature during deployment, upgrade, or at a future time. Functionality for new features should not be hard-coded, and must be configurable through the configuration file.

## Finding contributions to work on

Review the unofficial roadmap or look at the existing issues for a great way to find something to contribute on. As our projects, by default, use the default GitHub issue labels (enhancement/bug/duplicate/help wanted/invalid/question/wontfix), looking at any 'help wanted' issues is a great place to start.

## Code of Conduct

This project has adopted the [Amazon Open Source Code of Conduct](https://aws.github.io/code-of-conduct).
For more information see the [Code of Conduct FAQ](https://aws.github.io/code-of-conduct-faq) or contact
opensource-codeofconduct@amazon.com with any additional questions or comments. Link to [CODE_OF_CONDUCT](https://github.com/aws-samples/aws-secure-environment-accelerator/blob/master/CODE_OF_CONDUCT.md) file.

## Security issue notifications

If you discover a potential security issue in this project we ask that you notify AWS/Amazon Security via our [vulnerability reporting page](http://aws.amazon.com/security/vulnerability-reporting/). Please do **not** create a public github issue.

## Licensing

See the [LICENSE](LICENSE) file for our project's licensing. We will ask you to confirm the licensing of your contribution.

We may ask you to sign a [Contributor License Agreement (CLA)](http://en.wikipedia.org/wiki/Contributor_License_Agreement) for larger changes.
