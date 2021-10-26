# AWS Internal - Accelerator Release Process

## Creating a new Accelerator Code Release

1. Ensure `main` branch is in a suitable state
2. Disable branch protection for both the `main` branch and for the `release/` branches
3. Create a version branch with [SemVer](https://semver.org/) semantics and a `release/` prefix: e.g. `release/v1.0.5` or `release/v1.0.5-b`

   - On latest `main`, run: `git checkout -b release/vX.Y.Z`
   - **Important:** Certain git operations are ambiguous if tags and branches have the same name. Using the `release/` prefix reserves the actual version name for the tag itself; i.e. every `release/vX.Y.Z` branch will have a corresponding `vX.Y.Z` tag.

4. Push that branch to GitHub (if created locally)

   - `git push origin release/vX.Y.Z`

5. The release workflow will run, and create a **DRAFT** release if successful with all commits since the last tagged release.
6. Prune the commits that have been added to the release notes (e.g. remove any low-information commits)
7. Publish the release - this creates the git tag in the repo and marks the release as latest. It also bumps the `version` key in several project `package.json` files.
8. Re-enable branch protection for both the `main` branch and for the `release/` branches

   - Note: The `Publish` operation will run [the following GitHub Action][action], which merges the `release/vX.Y.Z` branch to `main`. **Branch Protection in GitHub will cause this to fail**, and why we are momentarily disabling branch protection.

   [action]: https://github.com/aws-samples/aws-secure-environment-accelerator/blob/main/.github/workflows/publish.yml

9. A successful run of this workflow will automatically kick off the "Generate Documentation" workflow. This workflow may also be initiated at any time manually via the GitHub Actions UI (since it is configured as a `workflow_dispatch` action).

   - once the documentaion is generated, add them to the release assets

10. Finally rename the `AcceleratorInstaller.template.json` to `AcceleratorInstaller`XXX`.template.json` replacing XXX with the version number without punctuation (i.e. `AcceleratorInstaller121b.template.json`)

---

[...Return to Accelerator Table of Contents](../index.md)
