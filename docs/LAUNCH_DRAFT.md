# Launch draft

Publish only after the live deployment has been verified. No posts are sent automatically.

I built GlobGap to show which file paths change when you edit a glob pattern. Changing `src/**/*.ts` to `src/*.ts` keeps `src/main.ts` but drops `src/lib/util.ts`. It generates synthetic examples, checks paths you paste, and copies a Markdown review report. Analysis runs in your browser with no uploads. It uses Picomatch 4.0.7 with a deliberately limited syntax and bounded search, so it can miss differences and does not prove equivalence. Try it: https://billy30183-rgb.github.io/globgap/ · Source: https://github.com/billy30183-rgb/globgap

Show HN: GlobGap – Find file paths affected by a glob change
