# AGENTS.md

Guidance for AI coding agents working in this repository. `CLAUDE.md` imports this file and adds the
Claude Code specifics.

## Project

Audit Notary is the server application in which a development organisation maintains its OWASP SAMM assessments, threat
models, incident response reports and ISMS documents as versioned documents on its Git server. It is built on the
libraries of `cuioss/git-document-repository` and on Token Sheriff, runs as a Quarkus native application on Java 25,
and has a web app and an MCP server.

**Current state:** bootstrap. The documentation index is [`doc/README.adoc`](doc/README.adoc): concepts in
`doc/concepts/`, decisions in `doc/adr/`, the use cases in `doc/UseCases.adoc` with one module per area in
`doc/use-cases/` (prefix `UC`, the backlog and its order), and the specification in `doc/specification/`, which states
the requirements (prefix `AUN`) together with their design. Read the concepts before changing the architecture. The modules of the root
POM (`de.cuioss.notary.audit:audit-notary-parent`) are added as they are built; the planned modules, their order and the ones built so
far are in `doc/specification/architecture-and-modules.adoc`, and each module has a `README.adoc`. The specification
describes the full design: a check or CI job it names may not exist yet.

Every statement about an external product, standard or law cites the source it was checked against; do not add
unverified statements. The documentation links into the library documentation only to its concepts and specifications,
by absolute address.

## Naming

*Audit Notary* in prose and headings, `audit-notary` in every identifier, `de.cuioss.notary.audit` for the Maven group
and the Java packages, `Audit-Notary` for the repository, `AUDIT_NOTARY_` for environment variables, `AUN` for
requirement identifiers. The reasoning is in
[`doc/concepts/brand.adoc`](doc/concepts/brand.adoc). The earlier names `CISOs-Friend` and `TrailHand` appear only there.

## Build

```bash
./mvnw clean verify                       # build and test everything
./mvnw test -Dtest=ClassName              # one test class
./mvnw test -Dtest=ClassName#methodName   # one test method

# Pre-commit auto-fix: license headers and every configured OpenRewrite recipe (modernisation, not only
# formatting). Review every resulting diff and commit it.
./mvnw -Ppre-commit clean verify -DskipTests
```

The modules, the full set of commands and the CI workflows are in
[`doc/development/README.adoc`](doc/development/README.adoc).

Always build and test through Maven and JUnit; do not call `javac` directly and do not add ad-hoc debug or
verification classes outside JUnit. The target is Java 25; CI builds on Java 25 and 27
(`maven-build.java-versions` in `.github/project.yml`).

## Conventions

- **Never add a dependency without the owner's approval.**
- **Login and session belong to Token Sheriff.** Every change to login, session, logout, CSRF, the session view,
  step-up or the local MCP gateway's login assumes that Token Sheriff's epic `client-framework-aspects` is
  implemented ([ADR-0004](doc/adr/0004-Login_and_session_are_designed_against_Token_Sheriffs_planned_session_layer.adoc)).
  Do not give `security/SessionStore`, `LoginTransactions`, `LoginService`, `web/RequestGate`, `web/Cookies` or
  `web/AuthResource` new capabilities; design against the planned modules. What cannot wait stays minimal, is marked
  "to be replaced by Token Sheriff `<module>` / `<requirement>`", and is shaped like the planned API.
- Documentation is AsciiDoc, except the root `README.md`, which is Markdown so that the mascot sits beside the badges on
  GitHub (owner's decision); Javadoc on every public type and method.
- The license is FSL-1.1-ALv2 (`LICENSE.md`, owner's decision); the Maven Wrapper and the mascot illustrations keep
  their own Apache-2.0 terms. Every source file carries the license header of `src/license/header.txt`;
  `-Ppre-commit` maintains it for Java sources (the root pom overrides the Apache-2.0 header of the parent pom), and
  the shell scripts carry the same text by hand. `inceptionYear` in the root pom must stay set, otherwise every run
  restamps all headers.
- The conventions for code (null safety, logging, results instead of exceptions, tests) are those of the libraries;
  see `doc/specification/architecture-and-modules.adoc` and `doc/specification/testing.adoc`.

## Git Workflow

`main` is protected: direct pushes are never allowed.

1. Create a branch with a CI-recognised prefix: `git checkout -b feature/<name>` (or `fix/`, `chore/`).
2. Commit, then `git push -u origin <branch>`.
3. Open the PR: `gh pr create --repo cuioss/Audit-Notary --head <branch> --base main --title "<title>" --body "<body>"`.
   Add the label `skip-bot-review` only when the review bots are not wanted.
4. Wait for the checks: `gh pr checks --watch`.
5. Handle every review comment: fetch with `gh api repos/cuioss/Audit-Notary/pulls/<n>/comments`.
   - Clearly valid and fixable: fix, commit, push, reply with the fix, resolve.
   - Disagree or out of scope: reply with the reason, resolve.
   - Not 100% sure: ask the user first.
   - Every comment gets a reply and is resolved.
6. Do not enable auto-merge. Do not merge unless the user says so. A pull request that changes
   `release.current-version` in `.github/project.yml` is a Maven Central release (see _Releases_) and goes through the
   runbook only.
7. Afterwards: `git checkout main && git pull`.

## Releases

The credentials and the release background are in [`doc/development/releasing.adoc`](doc/development/releasing.adoc);
the rules below stay binding here.

Merging a change of `release.current-version` in `.github/project.yml` **is** a Maven Central release: the
central version-changed guard of `reusable-maven-release.yml` publishes whenever the value differs from the
merge commit's first parent and no tag exists. Maven Central releases cannot be withdrawn.

- Never change `release.current-version` or `release.next-version` in an ordinary PR.
- Never dispatch the Release workflow outside the runbook: `workflow_dispatch` publishes unconditionally.
- Releases go through the runbook `.claude/skills/release/SKILL.md`. The first release (`0.1.0`) is a
  deliberate dispatch from `main`, only once there is something to release.
- Do not rewrite the `cuioss/cui-java-module-template` literal in `.github/workflows/release.yml`; it only
  excludes the template repository itself.
- `maven-build.enable-snapshot-deploy` is `true`: every push to `main` deploys the SNAPSHOT modules to the
  Sonatype snapshot repository. That is not a release.
- There is no Maven site and no GitHub Pages (`pages.deploy-at-release: false`); do not add either back
  without the owner's decision.
- Any PR that touches `.github/project.yml` starts the Release workflow on merge. The guard must skip it:
  check the run afterwards.

## Temporary Files

Use `.plan/temp/` for all temporary and generated files.
