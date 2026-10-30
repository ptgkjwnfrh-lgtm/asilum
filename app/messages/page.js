"use client";

// app/messages/page.js — THE MESSAGES PAGE (owner, 28 Oct 2026). The page is MessagesPage.jsx; this file only
// mounts it, so the route stays a thin door (lib/nav.js MESSAGES_HREF).
import MessagesPage from "../components/MessagesPage.jsx";

export default function Page() {
  return <MessagesPage />;
}
