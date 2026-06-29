"use client";
import { useState } from "react";

// PLANTED VULN (secrets): a secret key behind the public NEXT_PUBLIC_ prefix →
// ends up in the client bundle, visible in the browser.
const OPENAI_KEY = process.env.NEXT_PUBLIC_OPENAI_KEY;

export default function Home() {
  const [bio, setBio] = useState("");

  async function callOpenAI() {
    // PLANTED VULN (secrets): a paid API is called straight from the browser with the key.
    await fetch("https://api.openai.com/v1/chat/completions", {
      headers: { Authorization: `Bearer ${OPENAI_KEY}` },
    });
  }

  return (
    <main>
      <button onClick={callOpenAI}>Generate</button>
      {/* PLANTED VULN (websec/XSS): user input is rendered without escaping. */}
      <div dangerouslySetInnerHTML={{ __html: bio }} />
      <textarea value={bio} onChange={(e) => setBio(e.target.value)} />

      {/* PLANTED VULN (abuse-cost): a public signup form with no CAPTCHA. */}
      <form action="/api/signup" method="post">
        <input name="email" />
        <button type="submit">Sign up</button>
      </form>
    </main>
  );
}
