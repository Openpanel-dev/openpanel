# Security policy

We welcome reports of security issues in OpenPanel.

## Reporting a vulnerability

Please don't report security issues through public GitHub issues, pull requests, or our Discord. Report it privately instead, either by email to security@openpanel.dev or through the repository's GitHub Security Advisories at https://github.com/Openpanel-dev/openpanel/security/advisories/new ("Report a vulnerability"). Our contact details are also in our [security.txt](https://openpanel.dev/.well-known/security.txt).

To help us triage quickly, please include what you can:

- the affected component (API, dashboard, worker, or an SDK) and the file or endpoint involved
- the version, release, or commit you tested
- a description of the issue and its impact
- steps to reproduce, or a proof of concept
- a suggested fix, if you have one

## What to expect

- We try to acknowledge reports within 3 business days.
- We aim to confirm the issue and send an assessment within 7 days, then keep you posted while we work on a fix.
- When the fix ships, we'll let you know so you can confirm it.

## Coordinated disclosure

Please give us a reasonable chance to release a fix and notify self-hosters before any public write-up. If you plan to publish, a short heads-up on timing lets us make sure the patch is live for everyone first. We're happy to agree on a disclosure date with you.

## Supported versions

Security fixes land on the latest release. Before reporting an issue on a self-hosted instance, please confirm it reproduces on the latest version.

| Version                 | Supported           |
| ----------------------- | ------------------- |
| Latest release / `main` | Yes                 |
| Older releases          | No (please upgrade) |

## Scope

In scope: this repository (the API, dashboard, worker, and the official SDKs under `packages/sdks/*`) and the hosted service at openpanel.dev, dashboard.openpanel.dev, and api.openpanel.dev.

Out of scope, unless you can show concrete, exploitable impact:

- volumetric denial-of-service or resource-exhaustion attacks
- social engineering, phishing, or physical attacks
- automated scanner output with no demonstrated impact
- missing security headers or other best-practice findings without a working exploit
- vulnerabilities in third-party dependencies without a proof of concept against OpenPanel
- issues that need a compromised device, a rooted or jailbroken environment, or a man-in-the-middle position on the victim's own network
- self-XSS, and clickjacking on pages with no sensitive actions

## Safe harbor

We treat security research done in good faith under this policy as authorized, and we won't pursue legal action over accidental, good-faith violations. While you research, please:

- only touch accounts and data you own or have permission to test, and never access, change, or delete other users' data
- use test accounts, and avoid anything that could degrade the service for others (no DoS, no spam, no high-volume automated testing)
- stop and report once you've confirmed an issue, and keep the details private until we've shipped a fix

## Acknowledgements

We publicly thank researchers who report valid vulnerabilities, with their permission. If you'd like to be listed, tell us in your report how you want to be credited.

- [@geo-chen](https://github.com/geo-chen) — broken object-level authorization in saved reports (June 2026)
