# Reviewed frontend dependency backports

These temporary fixes preserve the installed Expo SDK and published dependency
versions. They change the affected executable code, rather than ignoring audit
results or pretending an upstream fixed release exists.

| Installed dependency | Advisory | Local correction and provenance |
| --- | --- | --- |
| `braces@3.0.3` | GHSA-vfj7-8cjw-p6xm | Bound actual parser nesting to 100; iterative preflight also bounds externally supplied ASTs and rejects node cycles before compile, expand and stringify. This is a local implementation of the guard suggested in the [upstream issue](https://github.com/micromatch/braces/issues/70), not an upstream released fix. |
| `node-forge@1.4.0` | GHSA-86w9-cpqp-85rv | Exact `lib/rsa.js` security change from [upstream PR1159](https://github.com/digitalbazaar/forge/pull/1159), commit `db05494352dd3c9a5a07c5270333dcc78866cad2`. It requires canonical DigestInfo encoding, rejecting extra elements, content inside NULL parameters and non-minimal lengths while accepting optional empty NULL. The PR remains unmerged at verification time. |
| `decode-uri-component@0.2.2` | GHSA-vcc3-ghjq-m6fr | [Official v0.5.0 UTF-8 scanner](https://github.com/SamVerschueren/decode-uri-component/releases/tag/v0.5.0), with CommonJS export and retained 0.2.2 plus-to-space normalization. A local single-pass callback also removes the upstream replacement-map loop, which otherwise rescans all input for each distinct malformed run. `manifest.json` records the normalized upstream source hash and the adapted payload hash. |

The parser limit applies to actual nested containers, including parentheses;
escaped braces and quoted/bracketed literals retain their existing behavior.
This bound addresses stack exhaustion. It is not a general promise that arbitrary
untrusted regular expressions or combinatorial glob expansion are safe.

Upstream licenses are retained in this directory. Braces and the decoder use MIT;
Forge's original dual license includes the BSD license used for this backport.

## Installation and drift protection

Normal root `npm ci` / `npm install` runs the dependency-free postinstall script.
For an installation performed with `--ignore-scripts`, run:

```powershell
npm run security:patch
npm run security:verify
```

`scripts/apply-frontend-security-patches.cjs` checks every lockfile instance of the
three libraries, both installed and locked versions, and normalized SHA-256
hashes of the reviewed pre-image and post-image files. It validates all input and
payload files before writing any dependency file. Reapplication is idempotent;
verification never writes. Unexpected source, package versions, missing packages
or missing patches fail closed. Root development, export and test commands verify
the patches before starting; Metro initialization verifies them for direct Expo
and workspace commands as well.

If a library is upgraded, review the new upstream fix and remove or update its
backport and regression tests together. Do not relax version/hash checks simply
to make installation succeed. Run the full client tests, type checks and both
application exports after any such change.

The raw npm audit continues to flag the published versions. The application uses
the reviewed patched source, but the audit result must be reported separately
from the executable-code regression result. No advisory allowlist or severity
filter is introduced.

## Verification

`tests/frontend-dependency-security.test.cjs` exercises the installed libraries:

- Excessive brace/parenthesis strings, deeply nested external ASTs and cycles are
  rejected; ranges, ordinary glob filtering, nesting within the limit, escaping
  and literal quoting retain their behavior.
- Actual RSA verification rejects extra DigestAlgorithm children, non-empty NULL
  parameters, and non-minimal inner and outer ASN.1 lengths. A count-only guard
  from the older upstream PR1152 was reproduced as insufficient and replaced
  with PR1159's canonical encoding check.
  Valid SHA-256/384/512 signatures with exponents 3 and 65537, optional NULL
  parameters, RSA-PSS/NONE, Expo certificates and CSR verification remain usable.
- Malformed URL corpora, including 24,000 distinct runs, complete in child
  processes with bounded time and heap.
  Arabic UTF-8, plus semantics, query-string arrays and real Expo Router path
  parsing retain their behavior.
- Fresh reviewed source can be reapplied, CRLF source is supported, and missing,
  changed or unreviewed dependency source is rejected before partial writes.

The negative cases were observed failing on the unpatched dependencies, then all
fourteen targeted tests passed on the patched dependencies. These are defensive
regression checks on local fixtures, with no provider requests or real accounts.
