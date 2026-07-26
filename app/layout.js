// app/layout.js
// Root layout: every page renders inside the magazine shell.

import "./globals.css";
import Shell from "./shell.js";

export const metadata = {
  title: "*ASILUM — fashion intelligence OS",
  description:
    "A learning moodboard engine that reads your taste across six bridges and builds a personal feed of listings.",
};

// Theme + interface mode are applied before first paint so a returning
// light-theme or ORB HUB user never sees a flash of the wrong chrome.
const PREPAINT = `try{var r=document.documentElement;r.dataset.theme=localStorage.getItem("asilum-theme")||"dark";r.dataset.model=localStorage.getItem("asilum-model")||"01";}catch(e){}`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: PREPAINT }} />
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
