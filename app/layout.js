// app/layout.js
// Root layout: every page renders inside the magazine shell.

import "./globals.css";
import Shell from "./shell.js";

export const metadata = {
  title: "*ASILUM — magazine",
  description:
    "A learning moodboard engine that reads your taste across six bridges and builds a personal feed of listings.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
