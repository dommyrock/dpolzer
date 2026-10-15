---
title: 'Why Cargo kept building our test binaries twice, and how a workspace-hack fixed it'
description: 'Cargo unifies features per command, so switching -p selections rebuilt our test binaries. How we measured it, fixed it with cargo-hakari, and halved the test binaries with line-tables-only debug info.'
pubDate: 'Oct 15 2026'
---

We run a Rust workspace of 26 crates: a handful of HTTP services, their database and message crates, and shared libraries. Most of the time nobody builds the whole workspace locally. You work on one service and run `cargo test -p core-api`, or `cargo test -p core-api -p gateway` when a change touches both.

One day we noticed that two test runs of the same service, one right after the other, each produced their own complete set of test binaries. Same source, same machine, same target directory, two copies. This post walks through why that happens, how we measured it, and how [cargo-hakari](https://docs.rs/cargo-hakari) fixed it. None of this is specific to our code: any workspace where services share dependencies but turn on different features of them will hit it.

## TL;DR

- Cargo unifies dependency features **per command**, over the packages that command selects. Select a different set of packages and a shared dependency can get a different feature set, so it gets a different hash and so does everything that depends on it, up to your test binaries.
- Two more things change the hash depending on the selection: a workspace crate turning on a feature of another workspace crate, and Cargo's lower debug info for build-time-only dependencies.
- Cargo's built-in fix (`resolver.feature-unification = "workspace"`) is still unstable. cargo-hakari generates a "workspace-hack" crate that pins one feature set for every selection.
- Result: 4,639 build units that used to depend on the selection now don't, and switching selections rebuilds nothing.
- Separately, 82% of every test binary was debug info for dependencies. One profile line halved the test binaries, cut an edit-and-rebuild of one crate's tests from 44 s to 22 s, and fixed the third cause too.

## The symptom

We give every git worktree its own Cargo target directory, so parallel work doesn't overwrite each other's builds. Each one is seeded from a warm target with a btrfs reflink copy, which shares disk blocks and costs nothing until Cargo writes new files. Two of those worktrees, for two small fixes, measured like this:

| Target dir | `du` says | Data only this dir uses (`btrfs filesystem du`) |
|---|---|---|
| fix 1 (one service touched) | 482 GiB | 5.3 GiB |
| fix 2 (two services touched) | 502 GiB | 28.3 GiB |

The `du` numbers are just the reflinked seed counted at full size, so ignore them. The real question was why fix 2 wrote 28 GiB. Breaking down the files written after the seed:

| Directory | Written |
|---|---|
| `target/debug/deps` | 21.5 GiB |
| `target/debug/incremental` | 6.8 GiB |

And inside `deps`, every integration test binary of `core-api` existed **twice**, about 720 MiB each, with different hashes:

```
750 MiB  compliance-83d28547d013760d
749 MiB  compliance-dc5f282280b03d11
726 MiB  flow-805f10b39af2e6ad
726 MiB  flow-664765b3bc278ad4
718 MiB  projection-7378fe85a670afc3
717 MiB  projection-6ebdf051ec2b5978
...
```

The agent working on that fix had run `cargo test -p core-api --test api` and later `cargo test -p core-api -p gateway`. Re-running both against the finished build directory confirmed it: neither recompiled anything, but they pointed at different files.

| Command | `compliance` test binary | `api` test binary |
|---|---|---|
| `cargo test -p core-api --tests --no-run` | `compliance-dc5f…` | `api-b794…` |
| `cargo test -p core-api -p gateway --tests --no-run` | `compliance-83d2…` | `api-b7bd…` |

Both commands report every artifact as `fresh`. Cargo isn't confused; it really considers these two different builds.

## Why: three ways a selection changes the hash

Cargo gives every compiled unit a metadata hash (`-C metadata=…`). The hash covers the package, the **features enabled for it**, the profile settings it is built with, and the hashes of its dependencies. Change any of those for a crate deep in the graph and the hash changes for every crate above it, all the way up to the test binaries.

### 1. Features are unified per command, not per workspace

With resolver 2, Cargo merges the features that all selected packages ask of a dependency and builds that dependency once with the union. The key word is *selected*. `cargo test -p core-api` resolves features over `core-api` and its dependencies only. Add `-p gateway` and Cargo also merges in whatever `gateway` turns on.

We diffed `cargo tree -e features` for the two selections. These dependencies, all shared with `core-api`, get extra features when `gateway` is selected:

| Dependency | Extra features when `gateway` is selected | Turned on by |
|---|---|---|
| `axum` 0.8 | `macros` | an internal auth middleware crate |
| `tower-http` 0.7 | `catch-panic`, `compression-gzip`, `limit`, `request-id`, `sensitive-headers`, `timeout` | `gateway`'s own `Cargo.toml` |
| `tower-http` 0.6 | `cors` | an internal CORS crate |
| `crossbeam-utils` 0.8 | `default` | `moka` (`future`); `core-api` gets it through `sqlx-core` |

You could line up the first two by listing the features in `[workspace.dependencies]`. The last two you can't: `core-api` doesn't depend on `tower-http` 0.6 or `crossbeam-utils` directly, and they arrive through other crates' dependencies.

### 2. A workspace crate that sets a feature of another workspace crate

Our `jobs-db` crate depended on `jobs-messages` with `features = ["sqlx"]`. `core-api` and `tracker` depend on `jobs-messages` without that feature. So any selection that included `jobs-db` (including `--workspace`) built `jobs-messages` with `sqlx`, which gave `core-api` and `tracker` new hashes too. This is the same problem as #1, but between your own crates.

### 3. Debug info for build dependencies depends on the selection

This one surprised us. Recent Cargo versions build build scripts, proc macros and their dependencies **without debug info** by default, because nobody steps through `syn` in a debugger. But if a selected package also needs one of those crates **at runtime**, Cargo builds it once with the normal dev profile (full debug info) and shares it.

In our workspace a document-rendering dependency (typst) uses `unicode-ident`, `semver` and `unicode-segmentation` at runtime. `unicode-ident` is also a dependency of `proc-macro2`, which every derive macro uses. So:

- `cargo test -p core-api`: `unicode-ident` is build-time only, so it gets no debug info.
- `cargo test --workspace`: the crate that pulls in typst is selected too, so `unicode-ident` is built with debug info. Every proc macro gets a new hash, and so does every crate that uses `#[derive(...)]`.

That accounted for 324 of the 754 units of `core-api` differing between `--workspace` and `-p core-api`.

### How much it added up to

`cargo test --tests --no-run --unit-graph` prints the full build plan without building. Comparing the plans of two selections unit by unit (package, features, full profile, all dependencies) gives the number of units the second command can't reuse from the first:

| First command, then second | Units that differ |
|---|---|
| `-p core-api -p gateway`, then `-p core-api` | 57 of 789 |
| `-p tracker -p jobs`, then `-p tracker` | 19 of 641 |
| `--workspace`, then `-p core-api` | 375 of 789 |
| `--workspace`, then `-p <crate>`, summed over all 26 crates | 4,639 |

CI never saw any of this, because it builds the whole workspace once per run. Local development and coding agents, which build one or two crates at a time, paid for it every time.

## Why not just use Cargo's own fix?

Cargo has the exact fix built in: `resolver.feature-unification = "workspace"` unifies features over the whole workspace no matter what you select. On our toolchain (cargo 1.95) it is still unstable:

```
warning: ignoring `resolver.feature-unification` without `-Zfeature-unification`
```

Until that ships on stable, the standard answer is a workspace-hack crate.

## The workspace-hack idea

A workspace-hack is an empty crate with no code that depends on every shared third-party dependency, with the union of all the features any workspace crate turns on. Every crate in the workspace depends on it. Since the hack is always in the graph, every selection resolves the same features for every dependency, and Cargo builds each one once.

The idea predates any tool. The Rust compiler's own repository kept a hand-written `rustc-workspace-hack` crate for years, and Firefox uses the same trick. Keeping one by hand is tedious and easy to get wrong, because the feature list has to follow every `Cargo.toml` change.

## cargo-hakari

[cargo-hakari](https://docs.rs/cargo-hakari) generates and checks that crate for you. It is part of the open-source [guppy](https://github.com/guppy-rs/guppy) project (MIT/Apache-2.0), a set of libraries for analysing Cargo dependency graphs. guppy was started at Facebook for the Diem codebase and is maintained by Rain (sunshowers), who also maintains cargo-nextest.

> **Note:** The [guppy-rs/guppy](https://github.com/guppy-rs/guppy) repository is a Cargo workspace that publishes several crates, so docs.rs links them all there: `cargo-hakari` is the CLI over the `hakari` library, which builds on `guppy` (dependency graph and feature resolution) and `target-spec` (`cfg(...)` per platform).

hakari reads the workspace with guppy, simulates feature resolution for every crate on the platforms you list, and writes the union into the hack's `Cargo.toml`. It is a CLI used on dev machines and in CI only. Nothing of it gets compiled into your binaries; the generated crate is a `Cargo.toml` plus an empty `lib.rs`.

### Setting it up

```sh
cargo install cargo-hakari --locked
cargo hakari init libraries/workspace-hack   # creates the crate and .config/hakari.toml
cargo hakari generate                         # writes the union of features into its Cargo.toml
cargo hakari manage-deps                      # adds the hack as a dependency of every crate
cargo hakari verify                           # checks the hack actually unifies everything
```

Our `.config/hakari.toml`:

```toml
hakari-package = "workspace-hack"
dep-format-version = "4"
# The workspace's resolver.
resolver = "2"
# Members write `workspace-hack.workspace = true`; the root Cargo.toml has the path.
workspace-hack-line-style = "workspace-dotted"
# The one target we build for locally, in CI and in the images.
platforms = ["x86_64-unknown-linux-gnu"]

# Crates from a private registry keep their `registry = "..."` in the hack.
[registries]
internal = { index = "sparse+https://crates.example.com/api/v1/crates/" }
```

`workspace-dotted` keeps the path in one place. In the root `Cargo.toml`:

```toml
[workspace.dependencies]
workspace-hack.path = "libraries/workspace-hack"
```

and in each crate's `Cargo.toml`:

```toml
[dependencies]
workspace-hack.workspace = true
```

If you enable the `unused_crate_dependencies` lint, each crate also needs one line in its `lib.rs` or `main.rs`, since nothing uses the hack directly:

```rust
use workspace_hack as _;
```

The generated `Cargo.toml` looks like this (shortened; ours is 279 lines):

```toml
# This file is generated by `cargo hakari`.
# To regenerate, run:
#     cargo hakari generate

[package]
name = "workspace-hack"
version = "0.1.0"
edition = "2024"
publish = false

### BEGIN HAKARI SECTION
[dependencies]
axum = { version = "0.8", features = ["macros", "multipart"] }
crossbeam-utils = { version = "0.8" }
internal-outbox = { version = "0.1", registry = "internal", features = ["contract-testing"] }
serde = { version = "1", features = ["alloc", "derive", "rc"] }
tower-http-ca01ad9e24f5d932 = { package = "tower-http", version = "0.7", features = ["catch-panic", "compression-gzip", "limit", "request-id", "sensitive-headers", "timeout", "trace"] }
# ...

[build-dependencies]
# the same list again, for build scripts and proc macros
# ...

[target.x86_64-unknown-linux-gnu.dependencies]
tower-http-3b31131e45eafb45 = { package = "tower-http", version = "0.6", default-features = false, features = ["cors", "follow-redirect"] }
# ...
### END HAKARI SECTION
```

When two versions of one crate are in the graph (here `tower-http` 0.6 and 0.7), hakari keeps them apart with a hashed alias. Dependencies that only exist on some platforms go under `[target.<triple>.dependencies]`. The hack also needs a `build.rs`, even an empty `fn main() {}`, so that Cargo applies its `[build-dependencies]` section.

### Fixing what hakari can't

The hack can't depend on your own crates, so it can't unify a feature one workspace crate sets on another (cause 2). The durable fix is to stop doing it: we made `jobs-messages` depend on `sqlx` unconditionally instead of behind a feature. That was the only case, and it didn't change any binary, because every crate that used `jobs-messages` already built `sqlx` with the same features.

To keep it from coming back, a short script reads `cargo metadata --no-deps` and fails on any such edge. CI and the pre-push hook both run it, so it fails before a push instead of after one. The core of it:

```python
for package in metadata["packages"]:
    local = [dep for dep in package["dependencies"] if "path" in dep]
    keys = {dep.get("rename") or dep["name"] for dep in local}
    # A dependency on a member with features, or without its default features.
    edges += [f"{package['name']} -> {dep['name']}" for dep in local
              if dep["features"] or not dep["uses_default_features"]]
    # A feature of this crate that turns on a feature of a member.
    edges += [f"{package['name']} -> {value}"
              for values in package["features"].values() for value in values
              if value.count("/") == 1 and value.split("/")[0].removesuffix("?") in keys]
```

The second half checks `[features]` entries such as `sqlx = ["jobs-messages/sqlx"]`. A feature string names a dependency by its key in the manifest, which is the rename when a crate writes `msgs = { package = "jobs-messages", path = "..." }`. So the prefix is compared with each crate's own path-dependency keys, not with the list of package names. Our first version compared with package names and would have missed a renamed dependency.

The build-time debug info split (cause 3) is a profile setting, not a feature, so hakari doesn't cover it either. Any setting that gives a crate the same debug level at build time and at runtime fixes it. We started with:

```toml
[profile.dev.build-override]
debug = true
```

`debug = false` made things worse: 218 units ended up duplicated in every selection. `true` cost 65 s → 68 s and 3.5 → 3.8 GiB on a clean build of a small service, and it had a catch in CI. Our CI test job sets `CARGO_PROFILE_DEV_DEBUG=line-tables-only`, which moves runtime code to line tables but leaves `build-override` at full debug info. 197 crates in CI's `--workspace` build plan were built twice until we also set `CARGO_PROFILE_DEV_BUILD_OVERRIDE_DEBUG` to the same value.

Then the debug info change from the bonus section below landed: `[profile.dev.package."*"] debug = "line-tables-only"`. A `package` override takes precedence over `build-override` and sets the level of every dependency, build scripts and proc macros included, so it fixes cause 3 by itself. With it, the build plans were the same with and without `build-override` (0 of 754 units differ either way). None of our own crates is a proc macro or a build dependency, so we dropped the override and the CI variable.

### Keeping it fresh in CI

A dependency bump or a new feature makes the hack stale, so CI checks it. This job compiles nothing and runs in seconds:

```yaml
hakari:
  name: Check the workspace-hack is up to date
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - run: rustup toolchain install
    # install-action has no manifest for cargo-hakari, so it falls back to
    # cargo-binstall for the release binary. Pin the version: a new hakari
    # can generate a different file.
    - uses: taiki-e/install-action@v2
      with:
        tool: cargo-hakari@0.9.39
        fallback: cargo-binstall
    - name: The workspace-hack's Cargo.toml is up to date
      run: cargo hakari generate --diff
    - name: Every crate depends on the workspace-hack
      run: cargo hakari manage-deps --dry-run
```

Locally, one recipe regenerates both:

```make
hakari:
  cargo hakari generate
  cargo hakari manage-deps --yes
```

The check caught a real case while this change was in review. A patch release of rustls (0.23.45 → 0.23.46, for four security advisories) landed on main. It changed only `Cargo.lock`, no `Cargo.toml`, and after the rebase `generate --diff` asked for one new line:

```toml
getrandom-468e82937335b1c9 = { package = "getrandom", version = "0.3", default-features = false, features = ["std"] }
```

We confirmed the cause by changing only the rustls version in the old lock file: the same line appeared. So a lockfile-only bump, like most Dependabot PRs, can make the hack stale.

The same rebase had a second problem. Git merged `Cargo.lock` as text without a conflict, but the hack's entry still listed `rustls 0.23.45` as a dependency while the file now held 0.23.46, and every command run with `--locked` refused the lock file. After rebasing onto a dependency change, run `just hakari` and one Cargo command without `--locked` (`cargo metadata` is enough) so Cargo rewrites the lock file, then commit both.

## The trade-off: keep the hack out of production images

The hack makes every crate build with the features of every other crate. That's what you want for local builds and tests, but not for a production binary. We checked the release dependency graph of each service with and without the hack:

| Release graph (packages) | without hack | with hack |
|---|---|---|
| gateway | 396 | 502 |
| core-api | 555 | 607 |
| jobs | 358 | 482 |
| tracker | 421 | 526 |
| auth | 352 | 479 |
| llm-proxy | 382 | 492 |

A small auth service would ship a Docker client, image codecs and more just because another service uses them. Worse, `rustls` 0.23 ended up with **both** crypto providers (`ring` and `aws-lc-rs`). With two providers compiled in, rustls can't pick a default, and any code that builds a TLS config without naming a provider panics at runtime. One of our NATS client libraries does exactly that.

hakari has a `cargo hakari disable` command that empties the generated section. Our build image doesn't have hakari, so a small script does the same edit before `cargo chef prepare`, and every image builds with exactly the dependency graph and features it had before:

```dockerfile
FROM chef AS source
COPY . .
RUN scripts/workspace-hack-disable.sh

FROM chef AS planner
COPY --from=source /app .
RUN cargo chef prepare --recipe-path recipe.json
```

```sh
#!/bin/sh
# Empties the generated section of the workspace-hack, as `cargo hakari disable` does.
set -eu
cd "$(dirname "$0")/.."
manifest=libraries/workspace-hack/Cargo.toml
section='/^### BEGIN HAKARI SECTION$/,/^### END HAKARI SECTION$/'

sed -i "${section}{//!d;}" "$manifest"
# sed changes nothing when a marker line is missing or reworded.
if [ "$(sed -n "${section}p" "$manifest" | wc -l)" -ne 2 ]; then
    echo "$manifest: no BEGIN/END HAKARI SECTION pair to empty" >&2
    exit 1
fi
```

The check at the end matters. If a hakari upgrade or a hand edit changes the marker lines, `sed` matches nothing and changes nothing, and the image would build with the whole hack without anyone noticing. With the check, the section must be down to exactly the two marker lines or the build stops. It is a script rather than a line in the Dockerfile because CI runs it too.

This has costs you should decide on knowingly:

- **Images no longer match what CI tests, unless CI also builds that way.** A service that forgets to declare a feature it needs compiles locally and in CI, because the hack turns the feature on. The hack also carries features that only dev-dependencies turn on, such as `tokio`'s `test-util`, so service code could call a test-only API and compile everywhere except in the image. Our images build only after merge, so that's where it would fail. So CI has a job that runs the same script and then `cargo check` on every binary the way its image builds it. The list comes from `cargo metadata`: `-p <package> --bins` per package, plus `--bin <name> --features <...>` for a binary with `required-features`. That's 10 selections for us. Each binary checks the shared dependencies with its own feature set, so the job took 4 min 38 s on a 16-core runner without a cache, about as long as our test job, and it runs in parallel with it. All 10 passed the first time.
- **Small crates build everything.** Every member depends on the union, so `-p` on a small crate compiles nearly all third-party dependencies of the workspace. One of our parser libraries went from 14 packages to 437, a message crate from 187 to 437. Once a target directory has the union, every later selection reuses it. hakari can take a crate off the hack with `[final-excludes] workspace-members`. Its dependencies still count toward the union, but the crate then gets its own copy of them whenever it's built alone, which is the duplication we set out to remove. We kept every crate on it.
- **Lockfile-only bumps can need a regen.** As with the rustls bump above, a Dependabot PR can fail the hakari job until someone pushes `just hakari` onto it.
- **Local runs get the union too.** `cargo run -p <service>` in a local dev stack also has both rustls providers, so the TLS panic above can happen locally even though the image is fine. Install a provider explicitly at startup (`rustls::crypto::aws_lc_rs::default_provider().install_default()`) and the problem goes away everywhere.

## Results

Unit plans, before and after the hack (units the second command can't reuse):

| First command, then second | before | after |
|---|---|---|
| `-p core-api -p gateway`, then `-p core-api` | 57 of 789 | 0 of 754 |
| `-p tracker -p jobs`, then `-p tracker` | 19 of 641 | 0 of 661 |
| `--workspace`, then `-p core-api` | 375 of 789 | 0 of 754 |
| `--workspace`, then `-p <crate>`, all 26 crates | 4,639 | 0 |

Real builds, each side on a fresh target directory, run one after the other on a 16-core machine (`cargo test <selection> --tests --no-run`):

| Step, in this order | before: wall / CPU / units built | after: wall / CPU / units built |
|---|---|---|
| 1. `-p core-api -p gateway` (cold) | 118 s / 1,276 s / 773 | 207 s / 1,389 s / 723 |
| 2. then `-p core-api` | 69 s / 392 s / 56 | 2.1 s / 1 s / 0 |
| 3. then `--workspace` | 204 s / 2,113 s / 711 | 206 s / 1,099 s / 269 |
| 4. then `-p tracker` | 81 s / 580 s / 180 | 1.0 s / 1 s / 0 |
| total | 472 s / 4,361 s | 416 s / 2,490 s |
| target dir afterwards | 88 GiB | 48 GiB |

CPU is user + system time of cargo and every rustc it ran. "After" is the hack with `build-override`, before the debug info change below. Two repeat runs that rebuilt nothing on either side (about 1 to 3 s each) are left out of the table and the totals. The steps that used to rebuild (2 and 4) now take a second. Step 3 still builds the crates `gateway` and `core-api` don't share, but at half the CPU. Over the whole sequence, CPU time drops by 43% and the target directory by 45%.

The cost shows up in step 1. A single selection now compiles the union of features, so the first cold build did 9% more CPU work. Its wall time went from 118 s to 207 s in this run. The CPU numbers don't explain a gap that large, and we didn't isolate whether it came from a longer critical path or from other load on the machine. Either way, you pay it once per target directory.

## Bonus: 82% of every test binary was debug info

While looking at those 720 MiB test binaries we noticed something else. Each integration test file in `tests/` becomes its own binary, and we have 41 of them. Each one links the whole dependency tree with full debug info:

| `compliance` test binary | MiB |
|---|---|
| whole file | 749 |
| `.debug_*` sections | 617 |
| `.text` (the actual code) | 65 |

Nobody steps into `tokio` internals with a debugger, but everyone wants file and line numbers in a panic backtrace. Line tables give exactly that:

```toml
# Dependencies keep file:line for backtraces; workspace crates keep full debug info.
[profile.dev.package."*"]
debug = "line-tables-only"
```

`[profile.dev.package."*"]` applies to every non-workspace crate, and it takes precedence over `build-override`, so it also covers build scripts and proc macros. That is why it fixed cause 3 as well. The `compliance` binary afterwards:

| `compliance` test binary | before | after |
|---|---|---|
| whole file | 749.0 MiB | 379.4 MiB |
| `.debug_*` sections | 617.1 MiB | 253.2 MiB (−59%) |
| `.text` | 64.5 MiB | 58.8 MiB |

Why it is faster: rustc writes full debug info (types, variables, scopes) for every dependency, and the linker copies all of it into each test binary. Line tables keep only the mapping from code addresses to file and line, so there is less to generate, write and link. A cold build saves a little. The edit-and-rebuild loop saves the most, because one change to a crate relinks every one of its test binaries.

Measured with `cargo test -p core-api --tests --no-run` on fresh target directories, before and after, on a busy 16-core machine. For the rebuild we touched one source file of `core-api`, which recompiles it and relinks its 12 test executables; the table shows the median of three runs:

| | before | after | change |
|---|---|---|---|
| cold build, wall time | 170 s | 165 s | −3% |
| cold build, CPU time | 1,454 s | 1,346 s | −7% |
| edit + rebuild, wall time | 44 s | 22 s | −50% |
| edit + rebuild, CPU time | 132 s | 92 s | −30% |
| the 12 test executables | 8,061 MiB | 3,881 MiB | −52% |
| `target/debug/deps` | 11.75 GiB | 6.87 GiB | −42% |
| whole target dir | 15.39 GiB | 10.52 GiB | −32% |

The wall times are noisy on a shared machine (rebuilds took 25 to 49 s before, 15 to 23 s after), but every run after the change was faster than every run before it, and the CPU times barely moved between runs (125 to 133 s before, 92 to 93 s after).

A test that panics inside `tokio::spawn` still shows every dependency frame with its location:

```
  12: tokio::runtime::task::harness::poll_future
             at .../tokio-1.53.2/src/runtime/task/harness.rs:523:18
  13: tokio::runtime::task::harness::Harness<T,S>::poll_inner
             at .../tokio-1.53.2/src/runtime/task/harness.rs:210:27
```

If that is still too big, the next steps are `split-debuginfo = "unpacked"` (Linux keeps debug info in per-crate `.dwo` files instead of copying it into each binary), or merging each crate's integration tests into one binary with a single `tests/it/main.rs` that declares one module per file.

## Checklist for your own workspace

1. Check whether you have the problem. Build two selections that share a crate, then run the first again with `--message-format=json`. If anything says `"fresh": false`, or the executable names change, you have it.
2. Find out why. Diff `cargo tree -e features` across the two selections. For profile differences, compare the build plans from `cargo +nightly test -Z unstable-options --unit-graph --tests --no-run`.
3. Add a workspace-hack with `cargo hakari init`, `generate` and `manage-deps`, and a CI job that runs `generate --diff` and `manage-deps --dry-run`. Regenerate after every lock file change, including a rebase onto one.
4. Remove features that one workspace crate sets on another, and guard against new ones in CI and in a pre-push hook, matching on dependency keys so renames are caught.
5. Set `[profile.dev.package."*"] debug = "line-tables-only"`. It gives every dependency the same debug level at build time and at runtime, and it halves the test binaries. (`[profile.dev.build-override] debug = true` alone also fixes the split; if you use it and CI overrides `CARGO_PROFILE_DEV_DEBUG`, set `CARGO_PROFILE_DEV_BUILD_OVERRIDE_DEBUG` to the same value.)
6. Decide whether production builds keep the hack. If not, empty its section in the image build, fail the build if the markers are missing, check every binary that way in CI, and install your TLS crypto provider explicitly.
7. Once `resolver.feature-unification = "workspace"` is stable, you can drop the hack and set that instead.
