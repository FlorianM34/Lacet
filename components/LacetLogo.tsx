import Svg, { Path } from "react-native-svg";

interface Props {
  width?: number;
  color?: string;
}

const STROKE = "#4B9C78";

export default function LacetLogo({ width = 120, color = STROKE }: Props) {
  // SVG original viewBox: 0 0 680 220, paths concentrated between x=90..415, y=80..200
  // On crop sur la zone utile : viewBox "80 75 345 135"
  const aspectRatio = 345 / 135;
  const height = width / aspectRatio;

  return (
    <Svg
      width={width}
      height={height}
      viewBox="80 75 345 135"
    >
      {/* L */}
      <Path
        d="M 100 80 C 95 82, 88 100, 90 160 C 91 175, 95 185, 105 188 C 118 191, 135 187, 148 183"
        fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round"
      />
      {/* liaison L -> a */}
      <Path
        d="M 148 183 C 158 180, 162 165, 165 155"
        fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
      />
      {/* a */}
      <Path
        d="M 165 155 C 168 138, 185 128, 200 132 C 218 137, 222 158, 215 172 C 208 186, 193 190, 182 186 C 170 182, 165 172, 168 162"
        fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
      />
      <Path
        d="M 215 140 C 218 155, 220 172, 222 190"
        fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
      />
      {/* liaison a -> c */}
      <Path
        d="M 222 190 C 232 186, 238 175, 242 165"
        fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
      />
      {/* c */}
      <Path
        d="M 268 132 C 252 126, 236 138, 234 155 C 232 172, 242 188, 258 191 C 270 193, 282 187, 288 178"
        fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
      />
      {/* liaison c -> e */}
      <Path
        d="M 288 178 C 298 172, 305 162, 308 155"
        fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
      />
      {/* e */}
      <Path
        d="M 308 155 C 310 138, 328 128, 344 133 C 358 138, 362 155, 355 155 C 340 155, 316 155, 308 158 C 304 165, 308 178, 320 185 C 334 192, 352 188, 362 180"
        fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
      />
      {/* liaison e -> t */}
      <Path
        d="M 362 180 C 372 174, 378 162, 380 152"
        fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
      />
      {/* t : montant vertical */}
      <Path
        d="M 385 95 C 384 120, 382 155, 380 175 C 378 188, 382 195, 390 196 C 400 197, 410 190, 415 182"
        fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
      />
      {/* t : barre horizontale */}
      <Path
        d="M 365 148 C 375 146, 390 145, 405 147"
        fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
      />
    </Svg>
  );
}
