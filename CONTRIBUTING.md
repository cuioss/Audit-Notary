# Contributing to Audit Notary

Thank you for your interest in Audit Notary! We welcome contributions from the community.

## Contributor License Agreement (CLA)

Before we can accept your contribution, you must sign our Contributor License Agreement (CLA) once. This happens automatically when you create your first Pull Request via the [CLA Assistant](https://cla-assistant.io/).

### What the CLA grants

The CLA is a relicensing grant, not a copyright assignment. You keep ownership of your contribution. By signing, you grant the project a broad, perpetual, worldwide, royalty-free, irrevocable license to use, reproduce, modify, distribute, and prepare derivative works of your contribution, and — crucially — to sublicense and relicense it under any terms the project chooses, now or in the future.

This grant ensures that:
- You have the right to contribute the code
- The project may distribute your contribution under its current license and may relicense or sublicense it (for example, to issue commercial licenses or to change the project's future license terms) without seeking your renewed permission

## How to Contribute

### Reporting Issues

- First check if a similar issue already exists
- Use the issue templates
- Describe the problem or suggestion in as much detail as possible

### Security Issues

Please do not report security vulnerabilities through public GitHub issues. Use GitHub's private vulnerability reporting instead; see the [security policy](https://github.com/cuioss/.github/blob/main/SECURITY.md).

### Pull Requests

1. **Fork** the repository
2. Create a **feature branch** (`git checkout -b feature/my-improvement`)
3. **Build and verify** your changes (see below)
4. **Commit** your changes with meaningful commit messages
5. **Push** the branch (`git push origin feature/my-improvement`)
6. Create a **Pull Request**

### Before Committing

Audit Notary builds with Maven on Java 25; the modules and all commands are in the
[development guide](https://github.com/cuioss/Audit-Notary/blob/main/doc/development/README.adoc).

```bash
# License headers and the configured OpenRewrite recipes; review and commit the resulting diff
./mvnw -Ppre-commit clean verify -DskipTests

# Full build with all tests
./mvnw clean verify
```

Both builds must pass without errors before committing.

### Code Standards

- Follow the existing code conventions in the project
- Write tests for new functionality
- Document public APIs
- Keep commits atomic and traceable

### Commit Messages

We recommend [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new feature
fix: fix bug in XY
docs: update documentation
refactor: improve code structure
test: add or update tests
```

## Code of Conduct

We expect all contributors to interact respectfully and constructively. Insults, discrimination, or other inappropriate behavior will not be tolerated.

## License

By contributing, you agree that your contribution will be published under the [FSL-1.1-ALv2](https://github.com/cuioss/Audit-Notary/blob/main/LICENSE.md) license.

## Questions?

If you have questions, feel free to create an issue or contact the maintainers directly.

---

Thank you again for your contribution! 🎉
