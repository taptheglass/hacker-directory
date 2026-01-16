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
          The Hacker's Directory is a collection of personal homepages collected
          from{" "}
          <a href="https://news.ycombinator.com/item?id=46618714">Hacker News</a>.
          The links have not been vetted, but they are searchable. The site
          tracks clicks on the homepage and likes for each link. This app uses
          local cookies for necessary performance and data storage, such as
          persisting like state across your visits. None of this information is
          used to profile or identify you.

        </p>
        <p>
          The data collected from this site is yours to use with attribution.
          It is governed by the{" "}
          <a href="https://opensource.org/license/mit">MIT license</a>. You can
          view the license in its entirety on the{" "}
          <a href="https://github.com/taptheglass/hacker-directory">GitHub</a>.
        </p>
        <p>
          Be warned. None of these links have been vetted. Visit them with the expected sense and caution you'd use navigating to any unknown site.
        </p>
        <h3>Why Build This Site?</h3>
        <p>
          I built this site because I love the{" "}
          <a href="https://indieweb.org/">IndiWeb</a>. I love the idea of people
          just making websites for the fun of it. I read a lot of{" "}
          <a href="https://peopleandblogs.com/">People and Blogs</a> because
          blogging is still the most portable and honest way to express
          ourselves. If I'm looking for something specific, I'll use{" "}
          <a href="http://Marginalia.nu">Marginalia.nu</a>.
        </p>
        <p>
          I also wanted a challenge. I've never vibe coded an app before. You
          may roll your eyes at that for a variety of reasons, but with this
          unimportant small project, I thought it would be a great opportunity
          for me to see just how good agents have gotten. The rules: I can't
          write any code by hand. Every LOC would have to be written by AI. I
          would still be overseeing and steering the agents. This app would be
          mine by design and function, but without me actually writing the
          scraper, webserver, or SQL myself.
        </p>
        <p>
          Would I recommend you building your next app this way? Maybe? If you
          know how to code already and could build the app by hand, my answer is
          a cautious yes. I watched Claude like a hawk, manually approving every
          edit while I worked on setting up the deployment and figuring out how
          this app would work. Claude didn't really make any decisions beyond
          what code to write. If that's you, then this is the fastest way to
          build a website bar none.
        </p>
        <p>
          If you do not know how to code, or don't think you could build your
          project by hand if you had no access to AI, I'd say go ahead and try.
          AI is like a really smart but clumsy intern. You can get a lot out of
          it, but there's no guarantee it won't make mistakes or give you bad
          output. You need to be capable of reviewing its decisions if you want
          a working app in the long run.
        </p>
        <h3>How Does This Work?</h3>
        <p>
          A less sanctimonious goal of mine was to make this site cost as little
          as possible. The database is free and hosted by Neon. The site itself
          is written in TypeScript and ran via Deno using{" "}
          <a href="http://Fly.io">Fly.io</a>. The only costs this site
          accumulates will be from hosting, which should be very very little if
          anything, and the cost of the domain $5.18 this year, renewing at $28
          next. If this site is used frequently, I will renew the domain and
          keep it live. Otherwise next year this site will be moved to some
          subdomain of mine as I don't need another subscription. If you would
          like this site to survive, consider{" "}
          <a href="https://www.paypal.com/ncp/payment/VNGWLASB3634W">
            supporting it with a small donation
          </a>.
        </p>
      </main>
    </body>
  </html>
);
