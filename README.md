
# Lab Activity 4 — ES6+ & Asynchronous JavaScript

**Wire Desk** — a live "dispatch board" built on top of the [JSONPlaceholder](https://jsonplaceholder.typicode.com/) API, using `/posts` as the main data source (plus `/users` and `/posts/:id/comments` to enrich it).

No frameworks or build step — open `index.html` in a browser (or serve the folder) and it fetches live data.

## Live features → concepts covered

| Feature in the app | ES6+ / Async concept |
|---|---|
| `fetchJSON()` helper | Fetch API, `res.ok` checks, throwing a custom `Error` on bad status |
| `loadBoard()` | `async`/`await`, `try/catch`, `Promise.all()` for parallel requests |
| Author lookups | `Map`, arrow functions, optional chaining (`?.`), nullish coalescing (`??`) |
| `getVisiblePosts()` | `.filter()`, `.sort()`, array destructuring in callback params |
| `renderStats()` | `.reduce()` for tallying posts per author and averages |
| `renderCard()` | Object destructuring with default values, template literals |
| `truncate(text, max = 220)` | Default parameters |
| "View responses" per post | Lazy `async` fetch on click, cached in a `Map` so it only fetches once |
| "Send dispatch" dialog | `fetch()` **POST** with a JSON body, spread (`[...]`, `{...}`) to update state without mutation |
| Search / filter / sort controls | Event delegation, debounced `input` handler |

## Project structure

```
LabActivity4-LastName-ES6Asynch/
├── index.html      # markup + controls + <dialog> for new dispatches
├── css/style.css    # "wire service" visual theme
├── js/app.js        # all fetch + ES6+ logic, commented by section
└── README.md
```

## Run it

Any static file server works, e.g.:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Then open the printed local URL. (Opening `index.html` directly via `file://` also works for this API since JSONPlaceholder sends permissive CORS headers, but a local server is recommended.)

## API endpoints used

- `GET https://jsonplaceholder.typicode.com/posts`
- `GET https://jsonplaceholder.typicode.com/users`
- `GET https://jsonplaceholder.typicode.com/posts/{id}/comments`
- `POST https://jsonplaceholder.typicode.com/posts`

Note: JSONPlaceholder is a mock API — `POST` requests are accepted and echoed back with a fake `id`, but nothing is actually persisted server-side.
