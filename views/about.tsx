/** @jsxImportSource hono/jsx */
import type { FC } from "hono/jsx";
import { Navbar } from "./components/navbar.tsx";

export const AboutPage: FC = () => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="description" content="About The Hacker's Directory" />
      <title>About · The Hacker's Directory</title>
      <link rel="icon" href="/static/favicon.png" type="image/png" />
      <link rel="stylesheet" href="/static/styles.css" />
    </head>
    <body>
      <Navbar />

      <main class="about">
        <h2>About</h2>
        <p>
          Hacker Directory is a collection of personal home pages posted by Hacker News users. On January 15th, 2026 HN user <a href="https://news.ycombinator.com/user?id=susam">susam</a> <a href="https://news.ycombinator.com/item?id=46618714">posted an Ask HN</a>{" "}requesting users to post their personal website so that they could be added to a currated directory. 
        </p>
        <p>
          I love visiting personal websites, it's like being invited into someone's home. Unfortunatly, they're pretty hard to find just searching around, so I decided to attempt a challenge
          
        </p>
        <p>
        </p>
      </main>
    </body>
  </html>
);
