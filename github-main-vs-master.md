# How Many GitHub Repos Still Use `master`? An Investigation with GH Archive on BigQuery

**Keywords:** github, master, main, default branch, rename, gh archive, bigquery, statistics

---

## The Question

GitHub flipped the default branch name for new repositories from `master` to `main` on **October 1, 2020**. Git itself shipped `init.defaultBranch` in **July 2020** (Git 2.28), GitLab followed in **June 2021** (14.0), and Bitbucket, Gitea, and the major installers all switched around the same time.

That's the easy part. The harder question: **did the rename actually stick?** Of the repos active on GitHub today, what fraction still defaults to `master`, and where is the holdout concentration?

GitHub doesn't publish this metric directly. But **GH Archive** mirrors every public GitHub event since 2011 and is queryable on **BigQuery** for free (1 TB scanned per month). So we can just count.

## What We Cannot Measure

The obvious approach — count `CreateEvent` rows with `payload.ref_type = 'repository'` and group by `payload.master_branch` — does not work. The modern GH Archive feed no longer carries repo-creation events:

```sql
SELECT type, COUNT(*) FROM `githubarchive.day.20260101` GROUP BY type ORDER BY 2 DESC;
```

Returns 16 event types — `PushEvent`, `PullRequestEvent`, `CreateEvent` (branches/tags only, not repos), etc. Repo creation isn't in the public stream.

So we need two proxies for "what is this repo's default branch":

1. **`PullRequestEvent` → `payload.pull_request.base.ref`** — PRs are nearly always opened against the default branch. Clean signal, but only covers PR-driven repos.
2. **`PushEvent` → `payload.ref`** — direct pushes to a branch. Broader coverage (solo repos that never see a PR), but noisier because it includes feature-branch pushes.

The current `PushEvent` payload was also trimmed at some point — `size` and the `commits` array are gone. You only get `ref`, `head`, `before`, `push_id`, `repository_id`. So commit counts are off the table; pushes are the unit of measurement.

## Headline Numbers — April 2026

**Push activity** (`githubarchive.month.202604`):

```sql
SELECT
  CASE
    WHEN JSON_VALUE(payload, '$.ref') = 'refs/heads/main'   THEN 'main'
    WHEN JSON_VALUE(payload, '$.ref') = 'refs/heads/master' THEN 'master'
    ELSE 'other'
  END AS branch,
  COUNT(*) AS pushes,
  COUNT(DISTINCT repo.id) AS repos
FROM `githubarchive.month.202604`
WHERE type = 'PushEvent'
GROUP BY branch
ORDER BY pushes DESC;
```

| branch | pushes | repos |
|---|---:|---:|
| main | 56.8M (71.1%) | 6.96M (72.5%) |
| master | 6.54M (8.2%) | 901K (9.4%) |
| other | 16.6M (20.8%) | 1.73M (18.0%) |

**PR activity** (PRs opened):

```sql
SELECT
  CASE
    WHEN JSON_VALUE(payload, '$.pull_request.base.ref') = 'main'   THEN 'main'
    WHEN JSON_VALUE(payload, '$.pull_request.base.ref') = 'master' THEN 'master'
    ELSE 'other'
  END AS base_branch,
  COUNT(*) AS prs,
  COUNT(DISTINCT repo.id) AS repos
FROM `githubarchive.month.202604`
WHERE type = 'PullRequestEvent'
  AND JSON_VALUE(payload, '$.action') = 'opened'
GROUP BY base_branch
ORDER BY prs DESC;
```

| base_branch | PRs | repos |
|---|---:|---:|
| main | 1.42M (71.9%) | 495K (70.4%) |
| master | 286K (14.5%) | 116K (16.4%) |
| other | 269K (13.6%) | 93K (13.2%) |

**Apples-to-apples (main vs master only, by distinct repos):**

| workflow | main share | master share |
|---|---:|---:|
| Push | **88.5%** | 11.5% |
| PR | **81.1%** | 18.9% |

So a first answer: among active repos in a typical month of 2026, **roughly 80–90% default to `main`, 10–20% still default to `master`** — with the master share heavier in PR-driven (team) workflows than in direct-push (solo) traffic.

Note also that push activity touches **13× more repos** than PR activity in the same month (7.86M vs 611K). The long tail of GitHub — personal projects, dotfiles, scratch repos — never opens a PR. That tail is overwhelmingly `main`.

## Cohort Analysis — Did Old Repos Actually Rename?

The headline number is a weighted average of two very different populations:

- **Pre-main repos**: created before GitHub's switch, defaulted to `master` at birth, had to actively rename to flip to `main`.
- **Post-main repos**: created after the switch, defaulted to `main` at birth.

To isolate them: GitHub assigns `repo.id` monotonically, so we can use ID thresholds. Find the max `repo.id` at the boundary month:

```sql
SELECT MAX(repo.id) FROM `githubarchive.month.202009`;  -- pre-main cutoff
SELECT MAX(repo.id) FROM `githubarchive.month.202106`;  -- post-main cutoff (GitLab 14.0 was the last major holdout)
```

Then filter April 2026 events with `repo.id <= <pre_cutoff>` or `repo.id > <post_cutoff>`.

**Pre-main cohort (repos created before Oct 2020, still active April 2026):**

| metric | main | master | other |
|---|---:|---:|---:|
| repos pushed | 43.7K (16.2%) | 127K (47.0%) | 99.7K (36.9%) |
| repos w/ PRs | 17.2K (26.7%) | 37.6K (58.5%) | 9.5K (14.7%) |

**Post-main cohort (repos created after Jun 2021):**

| metric | main | master | other |
|---|---:|---:|---:|
| repos pushed | 6.88M (74.5%) | 755K (8.2%) | 1.60M (17.3%) |
| repos w/ PRs | 471K (75.3%) | 73K (11.7%) | 82K (13.0%) |

**Side-by-side (main+master only, by repos):**

| cohort | metric | main | master |
|---|---|---:|---:|
| Pre-main | push | 25.6% | **74.4%** |
| Pre-main | PR | 31.4% | **68.6%** |
| Post-main | push | **90.1%** | 9.9% |
| Post-main | PR | **86.6%** | 13.4% |

## Findings

**1. Of legacy repos that had to make the rename decision, only ~30% actually did it.** More than five years after the default flipped, roughly **70% of pre-main repos still default to `master`**. The renaming friction (CI configs, branch protection rules, hardcoded refs, open PRs, deploy hooks) won.

**2. The "other" share in pre-main repos is enormous — 37–51% of activity.** These are exactly the older team projects with `develop` / `release/*` / feature-branch workflows. The same population that's most resistant to renaming the default is also the population least likely to push to the default in the first place.

**3. Post-main repos aren't 100% main — about 10% still use `master`.** Forks of pre-main repos inherit the parent's default; scaffolding tools and cookiecutters that predate the switch hardcode `master`; users explicitly configure `init.defaultBranch master` out of preference or muscle memory; self-hosted-to-GitHub imports carry their source default along.

**4. The pre-main cohort is now only ~3.5% of active push repos**, but punches above its weight in PR activity (~10% of PR repos). That's why the PR-side master share (18.9%) is higher than the push-side (11.5%) — old, team-driven projects do disproportionately PR-driven workflows.

**5. As pre-main repos die off, GitHub's master share won't go to zero — it will floor around 10%** unless fork inheritance and template defaults change. That's the structural floor the data reveals.

## TL;DR

| Cohort | main share (PR, repos) | master share |
|---|---:|---:|
| Pre-main (created ≤ Sep 2020) | 31% | **69%** |
| All active April 2026 | 81% | 19% |
| Post-main (created > Jun 2021) | **87%** | 13% |

New repos overwhelmingly default to `main`. Legacy repos overwhelmingly stayed on `master`. GitHub's headline number is the weighted average, drifting toward `main` slowly as old repos age out.

## Reproducing This

All queries above run against the public `githubarchive.*` dataset on BigQuery. A whole-month query scans ~tens of GB; the 1 TB/month free tier covers many runs. Start with a single day (`githubarchive.day.YYYYMMDD`) for schema validation before scanning monthly tables.

- GH Archive: **https://www.gharchive.org/**
- Dataset: `bigquery-public-data` → `githubarchive`
- GitHub's default branch announcement: **https://github.blog/changelog/2020-10-01-the-default-branch-for-newly-created-repositories-is-now-main/**
