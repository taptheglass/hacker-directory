/** @jsxImportSource hono/jsx */
import type { FC } from "hono/jsx";

export const Navbar: FC = () => (
  <header>
    <h1>
      <a href="/">The Hacker's Directory</a>
    </h1>
    <div class="header-links">
      <a href="/about" class="header-link">About</a>
      <a
        href="https://www.paypal.com/ncp/payment/VNGWLASB3634W"
        class="header-link"
        target="_blank"
        rel="noopener"
      >
        Support
      </a>
      <a
        href="/download.csv"
        download="h4cker-directory.csv"
        class="download-link"
      >
        Download CSV
      </a>
    </div>
  </header>
);
