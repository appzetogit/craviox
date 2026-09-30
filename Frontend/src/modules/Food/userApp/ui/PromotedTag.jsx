/** "Promoted" label for a restaurant running a paid ad (`isPromoted`). */
export default function PromotedTag({ fontSize = 9.5, compact = false }) {
  return (
    <span
      className="inline-block whitespace-nowrap"
      style={{
        padding: compact ? "1.5px 4px" : "2px 6px",
        borderRadius: compact ? 4 : 6,
        background: "var(--ca-primary-tint-strong)",
        color: "var(--ca-primary-deep-text)",
        fontSize,
        fontWeight: 800,
        letterSpacing: 0.2,
        lineHeight: 1.3,
      }}
    >
      Promoted
    </span>
  )
}
