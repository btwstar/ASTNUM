# Security Policy

ASTNUM is a local-first app: your data lives on your device and we want the
code base to deserve that trust.

## Supported versions

| Version | Supported |
| ------- | --------- |
| latest release (`main`) | ✅ |
| older releases | ❌ — please update |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

Instead, use GitHub's **"Report a vulnerability"** form on the
*Security → Advisories* tab of this repository, or open a private security
advisory. If you prefer, contact the maintainer via
[github.com/btwstar](https://github.com/btwstar).

Please include:

* a description of the issue and its impact
* steps or a proof-of-concept to reproduce it
* affected component (web shell, API routes, native Android layer, widgets…)

We aim to respond within **72 hours** and to keep you informed throughout the
fix. Coordinated disclosure is very welcome — thank you for helping keep
ASTNUM and its users safe!

## Scope notes

* The app is offline-first; API routes run on the user's own device. Reports
  about the bundled Next.js API routes still matter (they run inside the APK).
* Native widget code (`android-app/…/widget`) and the Capacitor bridge
  (`AstnumWidgetsPlugin`) are in scope.
* Dependency vulnerabilities: open an issue — or even better, a PR bumping the
  dependency after verifying nothing breaks.
