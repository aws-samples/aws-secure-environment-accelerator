# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.1] - 2025-02-14

### Added
- feat(tools): Add detection of modified route entries in network drift detection script

### Changed
- fix(resource-mapping): Use pagination to list stacks and improve nested stacks lookup
- fix(convert-config): Removed inaccurate warnings for SSM Document sharing with nested OUs
- fix(asea-prep): asea-prep command now disables ASEA EventBridge rule that adds the subscription filters to new Log Groups. A new rule is created by LZA during the installation.

## [1.6.0] - 2025-01-17

### Added
- First official release of the ASEA to LZA upgrade tools