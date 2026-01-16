/** @jsxImportSource hono/jsx */
import type { FC } from "hono/jsx";

export const GoogleAnalytics: FC = () => (
  <>
    {/* Google tag (gtag.js) */}
    <script
      async
      src="https://www.googletagmanager.com/gtag/js?id=G-J943R9DE44"
    >
    </script>
    <script
      dangerouslySetInnerHTML={{
        __html: `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-J943R9DE44');
        `,
      }}
    />
  </>
);
