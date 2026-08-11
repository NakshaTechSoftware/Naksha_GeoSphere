export function TerrainLegend() {
  return (
    <div className="pointer-events-none w-56 rounded-lg border border-white/70 bg-white/90 px-3 py-2 shadow-lg backdrop-blur-sm sm:w-64">
      <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-600">
        <span>Elevation</span>
        <span>metres</span>
      </div>
      <div
        className="h-3 rounded-sm border border-black/10"
        style={{
          background:
            "linear-gradient(90deg, #1470dc 0%, #0cbeda 7%, #15d2a7 16%, #37c45c 28%, #9bcd41 40%, #f5dc46 55%, #ff992d 70%, #eb4323 82%, #a61826 92%, #fffaf5 100%)",
        }}
      />
      <div className="mt-1 flex justify-between text-[9px] font-medium text-slate-600">
        <span>0</span>
        <span>600</span>
        <span>1,500</span>
        <span>4,000</span>
        <span>8,600 m</span>
      </div>
    </div>
  );
}
