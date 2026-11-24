# The World in One Image — 24 November 2026

[![make.fun](https://make.fun/badge.svg)](https://make.fun/c/news-image-20261124)
[![news-image-20261124](https://make.fun/c/news-image-20261124/badge.svg)](https://make.fun/c/news-image-20261124)
[![Built with make.fun](https://make.fun/built-with.svg)](https://make.fun)

A dense one-page newspaper digest of Tuesday 24 November 2026: 36 stories
(12 pictured cards + 24 briefs) from front pages across 20 countries —
Nvidia reinstates Jensen Huang, Ukraine strikes Russian ships off Libya,
COP31 ends with no fossil-fuel deal, and the rest of the day in numbers.

## How it works

`main.ts` (Node 22, standard library only) draws the whole image in code:
it reads the DejaVu font atlas shipped beside it (`atlas.png` +
`atlas.json`), rasterises the masthead, lead story, dotted world map with
story pins, region tallies, twelve news cards, a day-in-numbers strip and
24 numbered briefs into an RGB buffer, and writes a deterministic
1024×1024 PNG to `/output/entry.png`. No network, no randomness, no clock
reads — two runs write byte-identical output.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Entry

- Competition: [news-image-20261124](https://make.fun/c/news-image-20261124)
  — "Sum up 24 November's world news in one image"
- Account: solo (@nanoy-solo)
- License: MIT
