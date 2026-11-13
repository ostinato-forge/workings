# Workings

> **Status:** The arcade shell, the lesson engine, and the in-browser model engine run from a fresh clone, with 158 passing tests. Not every lesson has complete content yet, and the cabinet port is in progress. Maintained; active build.

Workings is a training platform for any subject. A lesson shows how a system actually works. You change a setting, run it, and watch what happens, instead of reading text, looking at pictures, or following lab steps.

The first course, and the only one in this repository so far, teaches how AI language models work. You turn the knobs on an arcade cabinet and watch a real, small model respond.

The model engine for that course is written in TypeScript and runs entirely in the browser: a tokenizer, byte-pair encoding, bigram and transformer models, sampling, and a token machine that replays training curves. There is no server and no API key.

## Run it

```bash
npm ci
npm run dev
```

Open the URL that Vite prints.

## Test and build

```bash
npm test        # type-check, then the vitest suite
npm run build   # production build in dist/
```

## Layout

| Path | What it holds |
|---|---|
| `src/engine` | The model engine and its tests |
| `src/lessons` | Lesson definitions, their contract, and the lint that checks them |
| `src/shell` | The arcade shell |
| `src/workbench` | The lesson player and its on-screen controls |
| `models` | Training scripts for the bundled curves |
| `docs/design/mockups` | The HTML mockups the lessons were designed from |

## License

Apache-2.0. Attribution: eparenti.
