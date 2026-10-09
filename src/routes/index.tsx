import { createFileRoute } from "@tanstack/react-router";
import { Intro } from "@/components/rift/Intro";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "RIFT — Every Transaction Leaves a Trace" },
      { name: "description", content: "Enter the RIFT cinematic demo: a simulated billionaire bank, live interchain transfers, NFC authorization, and real-time fraud detection." },
      { property: "og:title", content: "RIFT — Every Transaction Leaves a Trace" },
      { property: "og:description", content: "Real-time interchain fraud tracking — cinematic hackathon demonstration." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Intro,
});
