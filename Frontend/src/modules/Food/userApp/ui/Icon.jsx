/**
 * A Material Symbols Rounded icon — the web twin of Flutter's `Icons.*_rounded`.
 * The font is subset in index.html: a new `name` must be added there too.
 */
export default function Icon({ name, size = 24, color, outlined = false, className = "", style }) {
  return (
    <span
      aria-hidden="true"
      className={`ca-icon${outlined ? " ca-icon-outlined" : ""} ${className}`}
      style={{ fontSize: size, width: size, height: size, color, ...style }}
    >
      {name}
    </span>
  )
}
