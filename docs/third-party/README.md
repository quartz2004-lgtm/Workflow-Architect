# Vendored license texts

`uiw-react-codemirror-4.25.12-LICENSE.txt` is the unmodified MIT license from the [upstream v4.25.12 source](https://raw.githubusercontent.com/uiwjs/react-codemirror/v4.25.12/LICENSE). It covers the monorepo packages `@uiw/react-codemirror` and `@uiw/codemirror-extensions-basic-setup`, whose npm archives declare MIT but omit the license file. Review and update this fallback when their versions change; the generator deliberately rejects unmatched versions without a packaged license.

`mcp-server-filesystem-1.0.0-LICENSE.txt` is the unmodified repository license retrieved on 2026-10-15 from [upstream commit bbb701e7ac1e57f3edd1c2836b94c5457eaf7b9c](https://github.com/modelcontextprotocol/servers/blob/bbb701e7ac1e57f3edd1c2836b94c5457eaf7b9c/LICENSE). The filesystem 1.0.0 npm archive declares `SEE LICENSE IN LICENSE` but contains only dist files; no gitHead or filesystem release tag was supplied. This is a pinned upstream license snapshot, not a claim that the commit is the exact npm build source. Preserve the full Apache/MIT transition and documentation notices. Review this fallback on any version change.

Other production notices are read directly from the installed package versions pinned by package-lock.json. The generator performs no network requests.
