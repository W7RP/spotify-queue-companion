# Commit messages

Use [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/):

```text
<type>[optional scope]: <short description>
```

Use a lowercase type and an imperative description. Choose `feat` for features, `fix` for fixes, `docs` for documentation, `test` for tests, `build` for build changes and `chore` for maintenance. Add a scope when it makes the change clearer.

Examples:

```text
feat(queue): add a shortcut beside Spotify search
fix(installer): detect custom Spotify installation paths
docs(readme): add installer and Spotify screenshots
```

Describe the actual change. Add a body when the reason or validation needs explanation, and mark breaking changes according to the specification. Keep each commit focused on one logical change.
