# Jeopardy Board

A self-hosted, real-time Jeopardy game. One host controls the game from a laptop, a display view can be projected on a TV/projector, and players buzz in from their own phones.

## Running it

```
npm run install:all
npm run dev
```

This starts the server on `http://localhost:4000` and the client (Vite) on `http://localhost:5173`. Open the client URL in your browser.

To play across devices on the same Wi-Fi network, find your computer's LAN IP (e.g. `192.168.1.23`) and have players visit `http://192.168.1.23:5173/play` from their phones. The host and display views can also run on separate machines the same way.

## Views

- `/` — home page with links to the other views
- `/editor` — build a board: categories, clues, values, Daily Doubles, and Final Jeopardy. Save as JSON, or import a CSV.
- `/host` — pick a saved board and create a room; controls clue selection, buzzers, judging, and Final Jeopardy
- `/display/:code` — public board view for projecting, no answers shown
- `/play/:code` — player device: join with a name, buzz in, submit Final Jeopardy wagers/answers

## Board format

Boards are stored as JSON under `server/boards/*.json`:

```json
{
  "title": "My Jeopardy Game",
  "categories": [
    {
      "name": "SCIENCE",
      "clues": [
        { "value": 200, "clue": "This force pulls objects toward Earth.", "answer": "What is gravity?", "dailyDouble": false }
      ]
    }
  ],
  "finalJeopardy": { "category": "WORLD CAPITALS", "clue": "...", "answer": "..." }
}
```

CSV import expects columns `category,value,clue,answer,dailyDouble` (see `sample-boards/sample.csv`). Import it from the Board Editor, then fill in the Final Jeopardy clue afterward.

A sample board is preloaded at `server/boards/sample.json`.

## Notes

- Game state is in-memory per room — restarting the server ends any in-progress games (saved boards are unaffected).
- There's no login; anyone with the room code can join as a player, and anyone can open `/host`.
