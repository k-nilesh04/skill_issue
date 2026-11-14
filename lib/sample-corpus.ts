// LABELLED SAMPLE CORPUS — used ONLY when no TAVILY_API_KEY / search key is configured.
// These entries stand in for search results so the pipeline is demonstrable without keys.
// Everything derived from them is tagged SAMPLE in the UI and is never mixed with live
// run results (sample runs only ever contain sample records, and vice versa).
// The content strings are written in the same shape real search snippets come back in,
// so the extraction stage (model or heuristic fallback) runs against them unmodified.

export type SampleResult = { title: string; url: string; content: string };

export function sampleCorpus(): SampleResult[] {
  return [
    {
      title: "Delhi AI Builders Meetup — January Edition",
      url: "https://example.com/sample/delhi-ai-builders-meetup-january",
      content:
        "Event: Delhi AI Builders Meetup — January Edition. Organized by Delhi AI Collective. " +
        "The meetup starts on 2026-01-18 at 10:00 AM. Venue: JMI Incubation Centre, Okhla, New Delhi. City: Delhi NCR. " +
        "Mode: in-person. Register by 2026-01-16. Eligibility: open to all developers and students. " +
        "Registration link: https://example.com/sample/delhi-ai-builders-meetup-january/register " +
        "Tags: AI, meetup, LLM, open source. The event features talks on applied LLM agents and a hands-on build session.",
    },
    {
      title: "HackNova 2026 — 36-hour National Hackathon",
      url: "https://example.com/sample/hacknova-2026",
      content:
        "Event: HackNova 2026, a 36-hour national level hackathon. Organized by NSUT IIC, Delhi. " +
        "Starts on 2026-01-24 and ends on 2026-01-25. Venue: NSUT Campus, Dwarka, New Delhi. City: Delhi NCR. " +
        "Mode: in-person. Registration deadline: 2026-01-20. Eligibility: undergraduate students with a valid college ID. " +
        "Register at https://example.com/sample/hacknova-2026/register — tracks include AI, fintech and climate tech. Tags: hackathon, AI, students.",
    },
    {
      title: "DevConf India 2026 — Developer Conference, Gurugram",
      url: "https://example.com/sample/devconf-india-2026",
      content:
        "Event: DevConf India 2026. Organized by DevConf Foundation. Conference dates: starts on 2026-02-06, ends on 2026-02-07. " +
        "Venue: CyberHub Convention Centre, Gurugram. City: Delhi NCR. Mode: hybrid (in-person + streamed). " +
        "Register by 2026-02-01. Eligibility: professionals and students; early-bird pricing till 2026-01-10. " +
        "Registration link: https://example.com/sample/devconf-india-2026/register Tags: conference, devops, cloud, backend.",
    },
    {
      title: "Women in AI — Delhi Chapter Meetup",
      url: "https://example.com/sample/women-in-ai-delhi-february",
      content:
        "Event: Women in AI — Delhi Chapter Meetup. Organized by Women in AI India. " +
        "The meetup is scheduled for 2026-02-14. Venue: AWS Office, Sector 44, Gurugram. City: Delhi NCR. " +
        "Mode: in-person. Registration deadline: 2026-02-12. Eligibility: open to all, priority seating for women in tech. " +
        "Registration link: https://example.com/sample/women-in-ai-delhi-february/register Tags: AI, community, networking.",
    },
    {
      title: "Smart India Hackathon 2026 — Grand Finale (Delhi Node)",
      url: "https://example.com/sample/sih-2026-finale",
      content:
        "Event: Smart India Hackathon 2026 Grand Finale, Delhi node. Organized by Ministry of Education Innovation Cell. " +
        "Starts on 2026-01-28, ends on 2026-02-01. Venue: IIT Delhi Campus, Hauz Khas. City: Delhi NCR. Mode: in-person. " +
        "Registration closed for qualifiers; finale teams are pre-selected. Eligibility: qualified teams from SIH 2026 round 1. " +
        "Event page: https://example.com/sample/sih-2026-finale Tags: hackathon, government, students.",
    },
    {
      title: "GenAI Builders Bootcamp — Noida",
      url: "https://example.com/sample/genai-bootcamp-noida",
      content:
        "Event: GenAI Builders Bootcamp. Organized by Noida Developer Circle. Starts on 2026-02-21 and ends on 2026-02-22. " +
        "Venue: Sector 62 Co-working Hub, Noida. City: Delhi NCR. Mode: in-person. Register by 2026-02-18. " +
        "Eligibility: builders with basic Python experience. Registration link: https://example.com/sample/genai-bootcamp-noida/register " +
        "Tags: GenAI, bootcamp, workshop, agents.",
    },
    {
      title: "Open Source Delhi — Monthly Demo Night",
      url: "https://example.com/sample/osd-demo-night-feb",
      content:
        "Event: Open Source Delhi Monthly Demo Night. Organized by OSD Community. Scheduled for 2026-02-05. " +
        "Venue: Hauz Khas Village Community Hall, New Delhi. City: Delhi NCR. Mode: in-person. " +
        "Registration deadline: 2026-02-04. Eligibility: open to all. Registration link: https://example.com/sample/osd-demo-night-feb/register " +
        "Tags: open source, community, demos.",
    },
    {
      title: "CloudOps Summit Delhi 2026",
      url: "https://example.com/sample/cloudops-summit-delhi",
      content:
        "Event: CloudOps Summit Delhi 2026. Organized by CloudNative India Foundation. Conference starts on 2026-03-07. " +
        "Venue: Aerocity Convention Centre, New Delhi. City: Delhi NCR. Mode: in-person. Register by 2026-03-01. " +
        "Eligibility: working professionals and final-year students. Registration link: https://example.com/sample/cloudops-summit-delhi/register " +
        "Tags: cloud, kubernetes, sre, conference.",
    },
  ];
}
