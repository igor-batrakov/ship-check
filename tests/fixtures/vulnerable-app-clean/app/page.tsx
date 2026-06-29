"use client";
import { useState } from "react";

// ends up in the client bundle, visible in the browser.
const OPENAI_KEY = process.env.NEXT_PUBLIC_OPENAI_KEY;

export default function Home() {
  const [bio, setBio] = useState("");

  async function callOpenAI() {
    await fetch("https://api.openai.com/v1/chat/completions", {
      headers: { Authorization: `Bearer ${OPENAI_KEY}` },
    });
  }

  return (
    <main>
      <button onClick={callOpenAI}>Generate</button>
      <div dangerouslySetInnerHTML={{ __html: bio }} />
      <textarea value={bio} onChange={(e) => setBio(e.target.value)} />

      <form action="/api/signup" method="post">
        <input name="email" />
        <button type="submit">Sign up</button>
      </form>
    </main>
  );
}
