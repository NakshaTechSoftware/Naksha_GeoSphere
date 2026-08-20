"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Suspense } from "react";

function SketchContent() {
  const params = useSearchParams();
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const district = params.get("district") ?? "";
    const taluk = params.get("taluk") ?? "";
    const hobli = params.get("hobli") ?? "";
    const village = params.get("village") ?? "";
    const survey = params.get("survey") ?? "";
    const surnoc = params.get("surnoc") ?? "*";
    const hissa = params.get("hissa") ?? "*";

    if (!district || !taluk || !hobli || !village || !survey) {
      setError("Missing required parameters");
      setLoading(false);
      return;
    }

    fetch(
      `/api/land-records/survey-sketch?${new URLSearchParams({
        district, taluk, hobli, village, survey, surnoc, hissa,
      }).toString()}`,
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.message || data.error);
        // Extract just the SVG — strip all wrapper HTML, scripts, buttons, disclaimer text
        const raw = data.sketchHtml as string;
        const svgMatch = raw.match(/<svg[\s\S]*?<\/svg>/i);
        if (svgMatch) {
          let svg = svgMatch[0];
          // Remove fixed width/height so the SVG scales to fill
          svg = svg.replace(/\swidth="[^"]*"/g, "");
          svg = svg.replace(/\sheight="[^"]*"/g, "");
          // Expand viewBox by 12% on each side to give room for labels
          const vbMatch = svg.match(/viewBox="([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)"/);
          if (vbMatch) {
            const [, x, y, w, h] = vbMatch;
            const px = parseFloat(w!) * 0.12;
            const py = parseFloat(h!) * 0.12;
            svg = svg.replace(/viewBox="[^"]*"/, `viewBox="${parseFloat(x!) - px} ${parseFloat(y!) - py} ${parseFloat(w!) + px * 2} ${parseFloat(h!) + py * 2}"`);
          }
          svg = svg.replace(/<svg/, '<svg style="width:100%;height:100%;display:block" preserveAspectRatio="xMidYMid meet"');
          setHtml(svg);
        } else {
          setHtml(raw);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [params]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent mx-auto" />
          <p className="text-slate-600">Loading survey sketch…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-semibold text-red-700">Failed to load sketch</p>
          <p className="mt-1 text-sm text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-white flex items-center justify-center" style={{ margin: 0, padding: 0 }}>
      <div
        className="h-full w-full"
        dangerouslySetInnerHTML={{ __html: html ?? "" }}
      />
    </div>
  );
}

export default function SurveySketchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      }
    >
      <SketchContent />
    </Suspense>
  );
}
